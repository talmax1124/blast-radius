import assert from "node:assert/strict";
import test from "node:test";
import { resolve, join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createServer } from "vite";

test("daily publication is atomic, retryable, and isolated by date/task", async () => {
  // Never point an integration test at a configured live database.
  assert.ok(!process.env.DATABASE_URL, "Run this test with DATABASE_URL unset");
  const testDirectory = await mkdtemp(join(tmpdir(), "great-run-daily-test-"));
  const server = await createServer({
    configFile: false,
    // A second Vite instance must not replace the live preview's optimized modules.
    cacheDir: join(testDirectory, "vite-cache"),
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false },
    resolve: { alias: { "@": resolve("src") } },
    appType: "custom",
    logLevel: "error",
  });
  try {
    const { publishDailyTask, readDailyPayload, dailyHistory } = await server.ssrLoadModule(
      "/src/lib/research/store.server.ts",
    );
    let count = 0;
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        publishDailyTask("2026-10-05", "research", async () => {
          count++;
          return { report: "saved once" };
        }),
      ),
    );
    assert.equal(count, 1);
    assert.equal(results.filter((r) => r.status === "published").length, 1);
    assert.deepEqual(await readDailyPayload("2026-10-05", "research"), { report: "saved once" });
    assert.equal(
      (
        await publishDailyTask("2026-10-05", "research", async () => {
          throw new Error("must not rerun");
        })
      ).status,
      "already-published",
    );
    assert.equal(
      (
        await publishDailyTask("2026-10-05", "nfl", async () => {
          throw new Error("fixture failure");
        })
      ).status,
      "failed",
    );
    assert.equal(await readDailyPayload("2026-10-05", "nfl"), null);
    assert.equal(
      (await publishDailyTask("2026-10-05", "nfl", async () => ({ retry: true }))).status,
      "published",
    );
    assert.equal(
      (await publishDailyTask("2026-10-06", "research", async () => ({ nextDay: true }))).status,
      "published",
    );
    const { getSql } = await server.ssrLoadModule("/src/lib/db.ts");
    const sql = await getSql();
    await sql.query(
      "INSERT INTO desk_daily_runs (date, task, status, lease_token, started_at) VALUES ('2026-10-05', 'nhl', 'running', 'old-token', now() - interval '21 minutes')",
    );
    assert.equal(
      (await publishDailyTask("2026-10-05", "nhl", async () => ({ recovered: true }))).status,
      "published",
    );
    await sql.query(
      "INSERT INTO desk_daily_runs (date, task, status, lease_token) VALUES ('2026-10-05', 'board', 'running', 'current-token')",
    );
    assert.equal(
      (await publishDailyTask("2026-10-05", "board", async () => ({ unexpected: true }))).status,
      "in-progress",
    );
    assert.equal((await dailyHistory()).length, 5);
  } finally {
    await server.close();
    await rm(testDirectory, { recursive: true, force: true });
  }
});
