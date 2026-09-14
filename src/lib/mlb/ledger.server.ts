import { getSql } from "@/lib/db";
import { fetchSlate, gradePublishedCards } from "./engine.server";
import { shiftDate, todayEt } from "./parse";
import { SEP12_RECAP, entryPending, type DeskLogEntry, type SlateGameSnap } from "./recap";
import type { SlipCard } from "./types";

export type LedgerDay = DeskLogEntry & {
  complete: boolean;
  finals: number;
  live: number;
  games: number;
  slate: SlateGameSnap[];
};

type CardRow = {
  card_date: string;
  version: string;
  slips: unknown;
  grade_hits: number;
  grade_n: number;
  grade_dnp: number;
  grade_summary: string | null;
  complete: boolean;
  finals: number;
  live: number;
  games: number;
};

type DayRow = {
  day_date: string;
  recap: string | null;
  slate: unknown;
};

function windowDates(today: string): string[] {
  return Array.from({ length: 7 }, (_, i) => shiftDate(today, i - 6));
}

function asDate(value: unknown): string {
  return String(value).slice(0, 10);
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

function gradeOf(row: CardRow | undefined): DeskLogEntry["grade"] {
  if (!row) return null;
  if (row.grade_n + row.grade_dnp <= 0) return null;
  return {
    hits: Number(row.grade_hits) || 0,
    n: Number(row.grade_n) || 0,
    dnp: Number(row.grade_dnp) || 0,
    summary: row.grade_summary ?? "",
  };
}

function rowToDay(date: string, card: CardRow | undefined, day: DayRow | undefined): LedgerDay {
  return {
    date,
    version: card?.version ?? "",
    slips: parseJson<SlipCard[]>(card?.slips, []),
    grade: gradeOf(card),
    complete: Boolean(card?.complete),
    finals: Number(card?.finals) || 0,
    live: Number(card?.live) || 0,
    games: Number(card?.games) || 0,
    slate: parseJson<SlateGameSnap[]>(day?.slate, []),
  };
}

export async function upsertCard(entry: {
  date: string;
  version: string;
  slips: SlipCard[];
  grade: DeskLogEntry["grade"];
  complete?: boolean;
  finals?: number;
  live?: number;
  games?: number;
}): Promise<void> {
  const sql = await getSql();
  const slipsJson = JSON.stringify(entry.slips ?? []);
  await sql`
    insert into desk_cards (
      card_date, version, slips, grade_hits, grade_n, grade_dnp, grade_summary,
      complete, finals, live, games, updated_at
    )
    values (
      ${entry.date}::date,
      ${entry.version},
      ${slipsJson}::jsonb,
      ${entry.grade?.hits ?? 0},
      ${entry.grade?.n ?? 0},
      ${entry.grade?.dnp ?? 0},
      ${entry.grade?.summary ?? null},
      ${entry.complete ?? false},
      ${entry.finals ?? 0},
      ${entry.live ?? 0},
      ${entry.games ?? 0},
      now()
    )
    on conflict (card_date) do update set
      version = excluded.version,
      slips = excluded.slips,
      grade_hits = excluded.grade_hits,
      grade_n = excluded.grade_n,
      grade_dnp = excluded.grade_dnp,
      grade_summary = excluded.grade_summary,
      complete = excluded.complete,
      finals = excluded.finals,
      live = excluded.live,
      games = excluded.games,
      updated_at = now()
  `;
}

async function upsertDay(date: string, slate: SlateGameSnap[], recap: string | null): Promise<void> {
  const sql = await getSql();
  const json = JSON.stringify(slate);
  await sql`
    insert into desk_days (day_date, recap, slate, updated_at)
    values (${date}::date, ${recap}, ${json}::jsonb, now())
    on conflict (day_date) do update set
      recap = excluded.recap,
      slate = excluded.slate,
      updated_at = now()
  `;
}

async function seedSaturday(): Promise<void> {
  const sql = await getSql();
  const existing = await sql<CardRow>`
    select * from desk_cards where card_date = ${SEP12_RECAP.date}::date
  `;
  const slips = parseJson<SlipCard[]>(existing[0]?.slips, []);
  if (slips.length && existing[0]?.grade_n) return;
  await upsertCard({
    date: SEP12_RECAP.date,
    version: SEP12_RECAP.version,
    slips: SEP12_RECAP.slips,
    grade: SEP12_RECAP.grade,
    complete: true,
    finals: 15,
    live: 0,
    games: 15,
  });
}

function snapsFromSlate(slate: Awaited<ReturnType<typeof fetchSlate>>): SlateGameSnap[] {
  return slate.games.map((g) => ({
    away: g.away.abbr,
    home: g.home.abbr,
    awayScore: g.away.score,
    homeScore: g.home.score,
    state: g.abstractState,
    venue: g.venueName,
  }));
}

export async function syncLedgerWindow(today = todayEt()): Promise<LedgerDay[]> {
  await seedSaturday();
  const dates = windowDates(today);
  const start = dates[0];
  const sql = await getSql();
  const cardRows = await sql<CardRow>`
    select * from desk_cards where card_date >= ${start}::date and card_date <= ${today}::date
  `;
  const dayRows = await sql<DayRow>`
    select * from desk_days where day_date >= ${start}::date and day_date <= ${today}::date
  `;
  const cards = new Map(cardRows.map((r) => [asDate(r.card_date), r]));
  const days = new Map(dayRows.map((r) => [asDate(r.day_date), r]));

  const pending = dates
    .map((date) => {
      const card = cards.get(date);
      const slips = parseJson<SlipCard[]>(card?.slips, []);
      if (!slips.length) return null;
      const entry: DeskLogEntry = { date, version: card?.version ?? "", slips, grade: gradeOf(card) };
      if (card?.complete && !entryPending(entry)) return null;
      return { date, slips };
    })
    .filter((row): row is { date: string; slips: SlipCard[] } => !!row);

  if (pending.length) {
    const graded = await gradePublishedCards(pending);
    for (const g of graded) {
      const prev = cards.get(g.date);
      await upsertCard({
        date: g.date,
        version: prev?.version ?? "2.0",
        slips: g.slips,
        grade: g.grade,
        complete: g.complete,
        finals: g.finals,
        live: g.live,
        games: g.games,
      });
      cards.set(g.date, {
        card_date: g.date,
        version: prev?.version ?? "2.0",
        slips: g.slips,
        grade_hits: g.grade?.hits ?? 0,
        grade_n: g.grade?.n ?? 0,
        grade_dnp: g.grade?.dnp ?? 0,
        grade_summary: g.grade?.summary ?? null,
        complete: g.complete,
        finals: g.finals,
        live: g.live,
        games: g.games,
      });
    }
  }

  await Promise.all(
    dates.map(async (date) => {
      const existing = days.get(date);
      const snaps = parseJson<SlateGameSnap[]>(existing?.slate, []);
      if (snaps.length && snaps.every((s) => s.state === "Final")) return;
      try {
        const slate = await fetchSlate(date);
        const next = snapsFromSlate(slate);
        const finals = next.filter((s) => s.state === "Final").length;
        const recap =
          next.length === 0 ? "Off day" : finals === next.length ? `${next.length} Final` : `${finals}/${next.length} Final`;
        await upsertDay(date, next, recap);
        days.set(date, { day_date: date, recap, slate: next });
      } catch {
        /* leave blank */
      }
    }),
  );

  return dates
    .slice()
    .reverse()
    .map((date) => rowToDay(date, cards.get(date), days.get(date)));
}

export async function savePublishedCard(entry: {
  date: string;
  version: string;
  slips: SlipCard[];
  grade: DeskLogEntry["grade"];
  complete?: boolean;
  finals?: number;
  live?: number;
  games?: number;
}): Promise<LedgerDay[]> {
  await upsertCard(entry);
  return syncLedgerWindow();
}
