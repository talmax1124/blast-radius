import { getSql } from "@/lib/db";
import type { DailyRun, DailyTask } from "./types";

export async function readDailyPayload<T>(date: string, task: DailyTask): Promise<T | null> {
  const sql = await getSql();
  const [row] = await sql.query<{ payload: T }>(
    "SELECT payload FROM desk_daily_runs WHERE date = $1 AND task = $2 AND status = 'published'",
    [date, task],
  );
  return row?.payload ?? null;
}

export async function dailyHistory(): Promise<DailyRun[]> {
  const sql = await getSql();
  const rows = await sql.query<DailyRun>(
    "SELECT date, task, status, started_at, finished_at, error FROM desk_daily_runs ORDER BY date DESC, task LIMIT 28",
  );
  return rows.map((row) => ({
    ...row,
    started_at: new Date(row.started_at).toISOString(),
    finished_at: row.finished_at ? new Date(row.finished_at).toISOString() : null,
  }));
}

export async function publishDailyTask(date: string, task: DailyTask, run: () => Promise<unknown>) {
  const sql = await getSql();
  const token = crypto.randomUUID();
  // Atomic lease across processes. Published snapshots are immutable; only failed/expired runs retry.
  const claimed = await sql.query<{ task: string }>(
    `
    INSERT INTO desk_daily_runs (date, task, status, lease_token) VALUES ($1, $2, 'running', $3)
    ON CONFLICT (date, task) DO UPDATE SET status = 'running', lease_token = $3,
      started_at = now(), finished_at = NULL, error = NULL
    WHERE desk_daily_runs.status = 'failed' OR
      (desk_daily_runs.status = 'running' AND desk_daily_runs.started_at < now() - interval '20 minutes')
    RETURNING task`,
    [date, task, token],
  );
  if (!claimed.length) {
    const [existing] = await sql.query<{ status: string }>(
      "SELECT status FROM desk_daily_runs WHERE date = $1 AND task = $2",
      [date, task],
    );
    return {
      task,
      status:
        existing?.status === "published"
          ? ("already-published" as const)
          : ("in-progress" as const),
    };
  }
  try {
    const payload = await run();
    const saved = await sql.query(
      `UPDATE desk_daily_runs SET status = 'published', payload = $4::jsonb,
      finished_at = now() WHERE date = $1 AND task = $2 AND lease_token = $3 RETURNING task`,
      [date, task, token, JSON.stringify(payload)],
    );
    if (!saved.length) throw new Error("Daily run lease expired before publishing");
    return { task, status: "published" as const };
  } catch (error) {
    console.error(`[daily:${task}]`, error);
    // Do not persist provider URLs, keys, or arbitrary exception payloads in a user-visible log.
    await sql.query(
      `UPDATE desk_daily_runs SET status = 'failed', error = $4, finished_at = now()
      WHERE date = $1 AND task = $2 AND lease_token = $3`,
      [
        date,
        task,
        token,
        "This task could not publish. Check server logs and retry the daily run.",
      ],
    );
    return { task, status: "failed" as const };
  }
}
