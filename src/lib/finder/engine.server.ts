import { buildNbaBoard } from "@/lib/nba/engine.server";
import { buildNhlBoard } from "@/lib/nhl/engine.server";
import type { NhlSkater } from "@/lib/nhl/types";
import { hitCard, type Sample } from "./rate";
import type { FinderBoard, FinderRow } from "./types";

const NHL = "https://site.web.api.espn.com/apis/common/v3/sports/hockey/nhl/athletes";

type CacheEntry<T> = { expires: number; value: T };
const cache = new Map<string, CacheEntry<unknown>>();

function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return Promise.resolve(hit.value as T);
  return fn().then((value) => {
    cache.set(key, { expires: Date.now() + ttlMs, value });
    return value;
  });
}

type ShotLog = {
  names?: string[];
  seasonTypes?: { displayName?: string; categories?: { events?: { eventId?: string; stats?: string[] }[] }[] }[];
  events?: Record<string, { gameDate?: string }>;
};

function shotsFrom(log: ShotLog | null): Sample[] {
  if (!log) return [];
  const names = log.names ?? [];
  const index = names.indexOf("shotsTotal");
  if (index < 0) return [];
  const out: Sample[] = [];
  for (const type of log.seasonTypes ?? []) {
    const label = (type.displayName ?? "").toLowerCase();
    if (label.includes("post")) continue;
    const preseason = !label.includes("regular");
    for (const category of type.categories ?? []) {
      for (const event of category.events ?? []) {
        const value = Number(event.stats?.[index] ?? "");
        if (!Number.isFinite(value)) continue;
        out.push({
          value,
          date: (event.eventId && log.events?.[event.eventId]?.gameDate) || "",
          preseason,
        });
      }
    }
  }
  return out;
}

async function shotLog(id: string, year: number): Promise<Sample[]> {
  try {
    const data = await cached(`nhl:log:${year}:${id}`, 6 * 60 * 60 * 1000, async () => {
      const res = await fetch(`${NHL}/${id}/gamelog?season=${year}`, {
        headers: { Accept: "application/json", "User-Agent": "GreatRun/Finder-1.0" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as ShotLog;
    });
    return shotsFrom(data);
  } catch {
    return [];
  }
}

async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next;
      next += 1;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

function nhlRow(skater: NhlSkater, line: number, recent: Sample[], season: Sample[], pre: Sample[]): FinderRow {
  const card = hitCard(line, recent, season, pre);
  return {
    id: `${skater.gameId}:${skater.id}:${line}`,
    sport: "NHL",
    name: skater.name,
    team: skater.team,
    opp: skater.opp,
    pos: skater.pos,
    game: skater.gameLabel,
    start: skater.start,
    market: line === 1.5 ? "shots 1.5" : "shots 2.5",
    line,
    projection: skater.lambdaSog,
    lean: (line === 1.5 ? skater.pShots15 : skater.pShots25) >= 0.62 ? "over" : "pass",
    avg: card.avg,
    diff: card.diff,
    l5: card.l5,
    l10: card.l10,
    l15: card.l15,
    season: card.season,
    pre: card.pre,
    streak: card.streak,
    n10: card.n10,
    source: card.source,
  };
}

async function nhlRows(year: number): Promise<{ date: string; rows: FinderRow[] }> {
  const board = await buildNhlBoard();
  const picked: NhlSkater[] = [];
  for (const game of board.games) {
    const top = board.skaters
      .filter((skater) => skater.gameId === game.id)
      .sort((a, b) => b.lambdaSog - a.lambdaSog)
      .slice(0, 3);
    picked.push(...top);
  }
  const logs = await pool(picked, 6, async (skater) => {
    const [prior, current] = await Promise.all([shotLog(skater.id, year - 1), shotLog(skater.id, year)]);
    return { skater, prior, current };
  });
  const rows: FinderRow[] = [];
  for (const row of logs) {
    const pre = row.current.filter((sample) => sample.preseason);
    const currentReg = row.current.filter((sample) => !sample.preseason);
    const season = [...row.prior.filter((sample) => !sample.preseason), ...currentReg];
    const recent = currentReg.length ? currentReg : pre.length ? pre : season;
    rows.push(nhlRow(row.skater, 1.5, recent, season, pre));
    rows.push(nhlRow(row.skater, 2.5, recent, season, pre));
  }
  return { date: board.date, rows };
}

export async function buildFinder(now = new Date()): Promise<FinderBoard> {
  const year = now.getFullYear() + (now.getMonth() >= 8 ? 1 : 0);
  const [nba, nhl] = await Promise.all([buildNbaBoard(now), nhlRows(year)]);
  return {
    date: nba.date || nhl.date,
    rows: [...nba.finder, ...nhl.rows],
    notes: [
      "Hit rates are against our number, not a posted book line. NBA uses the half-point under the projection. NHL uses 1.5 and 2.5 shots.",
      "L5, L10, and L15 are this preseason until a regular-season game exists, then they switch to the regular season. SZN is last regular season. PRE is this preseason only.",
      "A preseason nudge is in the NBA projection only before the regular season starts, and four exhibition games cannot replace last year.",
    ],
  };
}
