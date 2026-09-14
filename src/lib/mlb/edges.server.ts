import { num, int, clamp, parseCsv } from "./parse";
import { normAbbr } from "./parks";
import type { PitcherHandSplit, SplitCard } from "./types";

const UA = "BlastRadius/1.3 (home-run desk)";
const MLB = "https://statsapi.mlb.com/api/v1";

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

async function csv(url: string): Promise<Record<string, string>[]> {
  const res = await fetch(url, {
    headers: { Accept: "text/csv", "User-Agent": UA },
    signal: AbortSignal.timeout(16000),
  });
  if (!res.ok) throw new Error(`Savant ${res.status}`);
  return parseCsv(await res.text());
}

function idOf(row: Record<string, string>): number {
  return Math.round(num(row.player_id || row.playerId || row.pitcher || row.id));
}

function n(row: Record<string, string>, key: string): number | null {
  if (!(key in row) || row[key] === "" || row[key] == null) return null;
  const v = num(row[key]);
  return Number.isFinite(v) ? v : null;
}

function asPct(value: number | null): number | null {
  if (value == null) return null;
  return value <= 1.5 ? value * 100 : value;
}

type StatSplit = {
  player?: { id: number; fullName?: string };
  team?: { id: number };
  split?: { code?: string };
  stat?: Record<string, unknown>;
};

type StatsPayload = { stats?: Array<{ splits?: StatSplit[] }> };

async function mlbStats(path: string): Promise<StatSplit[]> {
  const res = await fetch(`${MLB}${path}`, {
    headers: { Accept: "application/json", "User-Agent": UA },
    signal: AbortSignal.timeout(14000),
  });
  if (!res.ok) throw new Error(`MLB ${res.status}`);
  const data = (await res.json()) as StatsPayload;
  return data.stats?.[0]?.splits ?? [];
}

function splitCard(stat: Record<string, unknown> | undefined): SplitCard | null {
  if (!stat) return null;
  const avg = num(stat.avg);
  const slg = num(stat.slg);
  const pa = int(stat.plateAppearances);
  if (!pa) return null;
  return {
    avg,
    slg,
    ops: num(stat.ops),
    iso: clamp(slg - avg, 0, 1),
    hr: int(stat.homeRuns),
    pa,
    k: int(stat.strikeOuts),
    hits: int(stat.hits),
  };
}

function pitcherSplit(stat: Record<string, unknown> | undefined): PitcherHandSplit | null {
  if (!stat) return null;
  const bf = int(stat.battersFaced);
  if (!bf) return null;
  return {
    avg: num(stat.avg),
    slg: num(stat.slg),
    hr9: num(stat.homeRunsPer9),
    hits9: num(stat.hitsPer9Inn),
    k9: num(stat.strikeoutsPer9Inn),
    whip: num(stat.whip),
    ip: num(stat.inningsPitched),
    bf,
  };
}

export type SprintRow = { speed: number | null; hpTo1b: number | null; bolts: number | null };
export type BattedRow = { gb: number | null; fb: number | null; ld: number | null; pull: number | null };
export type PitcherRunRow = { rate: number | null; sb: number | null; cs: number | null };
export type CatcherRow = {
  name: string;
  cs: number | null;
  pop: number | null;
  arm: number | null;
  attempts: number;
};

export type EdgeMaps = {
  sprint: Map<number, SprintRow>;
  batted: Map<number, BattedRow>;
  pitcherRun: Map<number, PitcherRunRow>;
  catcherByTeam: Map<string, CatcherRow>;
  batterHands: Map<number, { vl: SplitCard | null; vr: SplitCard | null }>;
  batterHA: Map<number, { h: SplitCard | null; a: SplitCard | null }>;
  pitcherHands: Map<number, { vl: PitcherHandSplit | null; vr: PitcherHandSplit | null }>;
  teamObp: Map<number, number>;
};

function emptyMaps(): EdgeMaps {
  return {
    sprint: new Map(),
    batted: new Map(),
    pitcherRun: new Map(),
    catcherByTeam: new Map(),
    batterHands: new Map(),
    batterHA: new Map(),
    pitcherHands: new Map(),
    teamObp: new Map(),
  };
}

export async function loadEdgeMaps(season: number): Promise<EdgeMaps> {
  return cached(`edges:${season}:v1`, 20 * 60_000, () => fetchEdgeMaps(season));
}

async function fetchEdgeMaps(season: number): Promise<EdgeMaps> {
  const maps = emptyMaps();

  const [sprint, batted, run, catcher, hitVl, hitVr, hitH, hitA, pitVl, pitVr, teamHit] = await Promise.allSettled([
    csv(`https://baseballsavant.mlb.com/leaderboard/sprint_speed?year=${season}&position=&team=&min=0&csv=true`),
    csv(`https://baseballsavant.mlb.com/leaderboard/batted-ball?type=batter&year=${season}&min=1&csv=true`),
    csv(`https://baseballsavant.mlb.com/leaderboard/pitcher-running-game?year=${season}&team=&min=0&csv=true`),
    csv(`https://baseballsavant.mlb.com/leaderboard/catcher-throwing?year=${season}&team=&min=0&csv=true`),
    mlbStats(`/stats?stats=statSplits&group=hitting&season=${season}&sportId=1&sitCodes=vl&limit=800&playerPool=all`),
    mlbStats(`/stats?stats=statSplits&group=hitting&season=${season}&sportId=1&sitCodes=vr&limit=800&playerPool=all`),
    mlbStats(`/stats?stats=statSplits&group=hitting&season=${season}&sportId=1&sitCodes=h&limit=800&playerPool=all`),
    mlbStats(`/stats?stats=statSplits&group=hitting&season=${season}&sportId=1&sitCodes=a&limit=800&playerPool=all`),
    mlbStats(`/stats?stats=statSplits&group=pitching&season=${season}&sportId=1&sitCodes=vl&limit=800&playerPool=all`),
    mlbStats(`/stats?stats=statSplits&group=pitching&season=${season}&sportId=1&sitCodes=vr&limit=800&playerPool=all`),
    mlbStats(`/teams/stats?season=${season}&group=hitting&stats=season&sportIds=1`),
  ]);

  if (sprint.status === "fulfilled") {
    for (const row of sprint.value) {
      const id = idOf(row);
      if (!id) continue;
      maps.sprint.set(id, {
        speed: n(row, "sprint_speed"),
        hpTo1b: n(row, "hp_to_1b"),
        bolts: n(row, "bolts"),
      });
    }
  }

  if (batted.status === "fulfilled") {
    for (const row of batted.value) {
      const id = idOf(row);
      if (!id) continue;
      maps.batted.set(id, {
        gb: asPct(n(row, "gb_rate")),
        fb: asPct(n(row, "fb_rate")),
        ld: asPct(n(row, "ld_rate")),
        pull: asPct(n(row, "pull_rate")),
      });
    }
  }

  if (run.status === "fulfilled") {
    for (const row of run.value) {
      const id = idOf(row);
      if (!id) continue;
      maps.pitcherRun.set(id, {
        rate: n(row, "rate_sbx"),
        sb: n(row, "n_sb"),
        cs: n(row, "n_cs"),
      });
    }
  }

  if (catcher.status === "fulfilled") {
    for (const row of catcher.value) {
      const team = normAbbr(row.team_name);
      if (!team) continue;
      const attempts = n(row, "sb_attempts") ?? 0;
      const next: CatcherRow = {
        name: row.player_name || "Catcher",
        cs: n(row, "rate_cs"),
        pop: n(row, "pop_time"),
        arm: n(row, "arm_strength"),
        attempts,
      };
      const prev = maps.catcherByTeam.get(team);
      if (!prev || attempts > prev.attempts) maps.catcherByTeam.set(team, next);
    }
  }

  const fillHands = (payload: PromiseSettledResult<StatSplit[]>, code: "vl" | "vr") => {
    if (payload.status !== "fulfilled") return;
    for (const split of payload.value) {
      const id = split.player?.id;
      if (!id) continue;
      const card = splitCard(split.stat);
      const prev = maps.batterHands.get(id) ?? { vl: null, vr: null };
      prev[code] = card;
      maps.batterHands.set(id, prev);
    }
  };
  fillHands(hitVl, "vl");
  fillHands(hitVr, "vr");

  const fillHA = (payload: PromiseSettledResult<StatSplit[]>, code: "h" | "a") => {
    if (payload.status !== "fulfilled") return;
    for (const split of payload.value) {
      const id = split.player?.id;
      if (!id) continue;
      const card = splitCard(split.stat);
      const prev = maps.batterHA.get(id) ?? { h: null, a: null };
      prev[code] = card;
      maps.batterHA.set(id, prev);
    }
  };
  fillHA(hitH, "h");
  fillHA(hitA, "a");

  const fillPitch = (payload: PromiseSettledResult<StatSplit[]>, code: "vl" | "vr") => {
    if (payload.status !== "fulfilled") return;
    for (const split of payload.value) {
      const id = split.player?.id;
      if (!id) continue;
      const card = pitcherSplit(split.stat);
      const prev = maps.pitcherHands.get(id) ?? { vl: null, vr: null };
      prev[code] = card;
      maps.pitcherHands.set(id, prev);
    }
  };
  fillPitch(pitVl, "vl");
  fillPitch(pitVr, "vr");

  if (teamHit.status === "fulfilled") {
    for (const split of teamHit.value) {
      const id = split.team?.id;
      const obp = num(split.stat?.obp);
      if (id && obp) maps.teamObp.set(id, obp);
    }
  }

  return maps;
}
