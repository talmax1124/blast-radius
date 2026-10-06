import { namesMatch } from "./parse";
import { normAbbr } from "./parks";
import type { OddsType, PropLine, PropMarket } from "./types";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const STAT_TO_MARKET: Record<string, PropMarket> = {
  "Home Runs": "hr",
  Hits: "hits",
  "Total Bases": "tb",
  RBIs: "rbi",
  "Stolen Bases": "sb",
  "Pitcher Strikeouts": "k",
  "Hits+Runs+RBIs": "hrrbi",
  "Hits + Runs + RBIs": "hrrbi",
  Runs: "runs",
  "Fantasy Score": "fs",
  "Hitter Fantasy Score": "fs",
  "Fantasy Points": "fs",
  Points: "fs",
  "Hitter Points": "fs",
};

export type PpProjection = {
  id: string;
  name: string;
  teamAbbr: string;
  opponentAbbr: string;
  stat: string;
  market: PropMarket;
  line: number;
  oddsType: OddsType;
  startTime: string | null;
  isPromo: boolean;
};

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

function asOdds(raw: string | null | undefined): OddsType {
  if (raw === "demon" || raw === "goblin" || raw === "standard") return raw;
  return "standard";
}

function dateOf(iso: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
  return m?.[1] ?? null;
}

export async function loadPrizePicks(date: string): Promise<PpProjection[]> {
  return cached(`pp:${date}:v3`, 5 * 60_000, () => fetchPrizePicks(date));
}

async function fetchPrizePicks(date: string): Promise<PpProjection[]> {
  const urls = [
    "https://partner-api.prizepicks.com/projections?league_id=2&per_page=250&single_stat=true&game_mode=pickem",
    "https://partner-api.prizepicks.com/projections?league_id=2&per_page=250&single_stat=true",
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Origin: "https://app.prizepicks.com",
          Referer: "https://app.prizepicks.com/",
          "User-Agent": UA,
        },
        signal: AbortSignal.timeout(16000),
      });
      if (!res.ok) continue;
      const body = (await res.json()) as {
        data?: Array<{
          id?: string;
          attributes?: Record<string, unknown>;
          relationships?: Record<string, { data?: { id?: string } | null }>;
        }>;
        included?: Array<{ id?: string; type?: string; attributes?: Record<string, unknown> }>;
      };
      const players = new Map<string, { name: string; team: string }>();
      for (const obj of body.included ?? []) {
        if (obj.type !== "new_player" || !obj.id) continue;
        const a = obj.attributes ?? {};
        players.set(String(obj.id), {
          name: String(a.name ?? a.display_name ?? ""),
          team: normAbbr(String(a.team ?? "")),
        });
      }
      const out: PpProjection[] = [];
      for (const row of body.data ?? []) {
        const a = row.attributes ?? {};
        const stat = String(a.stat_type ?? "");
        const market = STAT_TO_MARKET[stat];
        if (!market) continue;
        const line = Number(a.line_score);
        if (!Number.isFinite(line)) continue;
        const pid = String(row.relationships?.new_player?.data?.id ?? "");
        const player = players.get(pid);
        if (!player?.name) continue;
        const startTime = typeof a.start_time === "string" ? a.start_time : null;
        const startDate = dateOf(startTime);
        if (startDate && startDate !== date) continue;
        out.push({
          id: String(row.id ?? `${player.name}-${stat}-${line}`),
          name: player.name,
          teamAbbr: normAbbr(player.team),
          opponentAbbr: normAbbr(String(a.description ?? "")),
          stat,
          market,
          line,
          oddsType: asOdds(typeof a.odds_type === "string" ? a.odds_type : null),
          startTime,
          isPromo: Boolean(a.is_promo),
        });
      }
      if (out.length) return out;
    } catch {
      /* try next */
    }
  }
  return [];
}

function preferredLine(market: PropMarket): number {
  if (market === "tb" || market === "hrrbi") return 1.5;
  if (market === "k") return 5.5;
  if (market === "runs") return 0.5;
  if (market === "rbi") return 0.5;
  if (market === "fs") return 5.5;
  return 0.5;
}

function rankLine(row: PpProjection): number {
  if (row.oddsType === "standard") return 30;
  if (row.oddsType === "demon") return 12;
  if (row.oddsType === "goblin") return 8;
  return 0;
}

export function playableLine(rows: PpProjection[], market: PropMarket): PropLine | null {
  const all = rows.filter((r) => r.market === market && !r.isPromo);
  if (!all.length) return null;
  const counting = market === "hrrbi" || market === "fs" || market === "runs";
  const std = counting ? all.filter((r) => r.oddsType === "standard") : [];
  const pool = std.length ? std : all;
  const target = preferredLine(market);
  const ranked = [...pool].sort((a, b) => {
    const rank = rankLine(b) - rankLine(a);
    if (rank) return rank;
    return Math.abs(a.line - target) - Math.abs(b.line - target);
  });
  const best = ranked[0];
  if (!best) return null;
  const side: PropLine["side"] = best.oddsType === "goblin" ? "under" : "over";
  return {
    line: best.line,
    side,
    oddsType: best.oddsType,
    stat: best.stat,
  };
}

export function groupPrizePicks(rows: PpProjection[]): Map<string, PpProjection[]> {
  const map = new Map<string, PpProjection[]>();
  for (const row of rows) {
    const list = map.get(row.teamAbbr) ?? [];
    list.push(row);
    map.set(row.teamAbbr, list);
  }
  return map;
}

export function matchPpRows(name: string, teamAbbr: string, grouped: Map<string, PpProjection[]>): PpProjection[] {
  const pool = grouped.get(normAbbr(teamAbbr)) ?? [];
  return pool.filter((row) => namesMatch(row.name, name));
}
