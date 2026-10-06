import { ICE, projectSkater, slipSweep, type SkaterPos } from "./score.ts";
import type { NhlBoard, NhlGame, NhlSkater, NhlSlip } from "./types.ts";

const UA = "GreatRun/NHL-1.0";
const ESPN = "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl";
const ROSTER = "https://site.web.api.espn.com/apis/common/v3/sports/hockey/nhl/teams";
const OVERVIEW = "https://site.web.api.espn.com/apis/common/v3/sports/hockey/nhl/athletes";

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

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": UA },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return (await res.json()) as T;
}

function etStamp(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function etClock(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

type Split = { displayName?: string; stats?: string[] };
type Overview = {
  statistics?: { names?: string[]; splits?: Split[] };
};

function splitNums(stats: Overview["statistics"], label: string): { gp: number; sog: number; pts: number; goals: number } | null {
  const names = stats?.names ?? [];
  const row = stats?.splits?.find((s) => s.displayName === label);
  if (!row?.stats) return null;
  const at = (name: string) => {
    const i = names.indexOf(name);
    const n = Number(i >= 0 ? row.stats?.[i] : NaN);
    return Number.isFinite(n) ? n : 0;
  };
  return { gp: at("games"), sog: at("shotsTotal"), pts: at("points"), goals: at("goals") };
}

type RosterAthlete = { id?: string; displayName?: string; fullName?: string; position?: { abbreviation?: string } };
type RosterGroup = { name?: string; athletes?: RosterAthlete[] };

function isGoalie(group: string): boolean {
  return group.toLowerCase().startsWith("goal");
}

function skaterPos(abbr: string): SkaterPos {
  return abbr === "D" ? "D" : "F";
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

type Side = {
  id: string;
  abbr: string;
  name: string;
  home: boolean;
};

function money(odds: { close?: { odds?: string } } | undefined): string | null {
  return odds?.close?.odds ?? null;
}

function etHour(d: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      hourCycle: "h23",
    }).format(d),
  );
}

export async function buildNhlBoard(now = new Date()): Promise<NhlBoard> {
  let stamp = etStamp(now);
  if (etHour(now) >= 23) stamp = etStamp(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  const ymd = stamp.replaceAll("-", "");
  return cached(`nhl:${ICE.version}:${ymd}`, 10 * 60 * 1000, () => loadBoard(ymd, stamp));
}

async function loadBoard(ymd: string, date: string): Promise<NhlBoard> {
  const scoreboard = await getJson<{
    events?: {
      id?: string;
      date?: string;
      competitions?: {
        status?: { type?: { shortDetail?: string } };
        odds?: { overUnder?: number; moneyline?: { home?: { close?: { odds?: string } }; away?: { close?: { odds?: string } } } }[];
        competitors?: { homeAway?: string; team?: { id?: string; abbreviation?: string; shortDisplayName?: string } }[];
      }[];
    }[];
  }>(`${ESPN}/scoreboard?dates=${ymd}`);

  const games: NhlGame[] = [];
  const jobs: { game: NhlGame; side: Side }[] = [];

  for (const event of scoreboard.events ?? []) {
    const comp = event.competitions?.[0];
    const comps = comp?.competitors ?? [];
    const away = comps.find((c) => c.homeAway === "away");
    const home = comps.find((c) => c.homeAway === "home");
    if (!away?.team?.abbreviation || !home?.team?.abbreviation || !away.team.id || !home.team.id || !event.id || !event.date) continue;
    const odds = comp?.odds?.[0];
    const game: NhlGame = {
      id: event.id,
      away: away.team.abbreviation,
      home: home.team.abbreviation,
      awayName: away.team.shortDisplayName ?? away.team.abbreviation,
      homeName: home.team.shortDisplayName ?? home.team.abbreviation,
      start: etClock(event.date),
      state: comp?.status?.type?.shortDetail ?? "Scheduled",
      total: odds?.overUnder ?? null,
      homeMl: money(odds?.moneyline?.home),
      awayMl: money(odds?.moneyline?.away),
      goalies: [],
    };
    games.push(game);
    jobs.push({ game, side: { id: away.team.id, abbr: game.away, name: game.awayName, home: false } });
    jobs.push({ game, side: { id: home.team.id, abbr: game.home, name: game.homeName, home: true } });
  }

  const skaters = (
    await mapPool(jobs, 4, async ({ game, side }) => {
      try {
        return await projectSide(game, side);
      } catch {
        return [];
      }
    })
  )
    .flat()
    .sort((a, b) => b.pShots15 - a.pShots15);

  const slip = buildSlip(skaters);
  return {
    date,
    fetchedAt: new Date().toISOString(),
    model: { version: ICE.version, shrinkGames: ICE.shrinkGames },
    games,
    skaters,
    slip,
    notes: [
      `ICE ${ICE.version} scores every skater on every game on the slate. Goalies are listed with the game. They do not get a shot line.`,
      "A full career keeps its own shot rate. Fewer than 40 career games is filled out with a forward or defense prior, then shrunk toward this season.",
      "Each fetch re-fits the whole board. After the 1:00 p.m. game, fetch again so the night numbers move.",
    ],
  };
}

async function projectSide(game: NhlGame, side: Side): Promise<NhlSkater[]> {
  const roster = await getJson<{ positionGroups?: RosterGroup[] }>(`${ROSTER}/${side.id}/roster`);
  const groups = roster.positionGroups ?? [];
  const seen = new Set<string>();
  const skaters: RosterAthlete[] = [];
  for (const group of groups) {
    const label = group.name ?? "";
    for (const player of group.athletes ?? []) {
      if (!player.id || seen.has(player.id)) continue;
      seen.add(player.id);
      const name = player.displayName || player.fullName;
      if (!name) continue;
      if (isGoalie(label) || player.position?.abbreviation === "G") {
        game.goalies.push({ name, team: side.abbr });
        continue;
      }
      skaters.push(player);
    }
  }
  const rows = await mapPool(skaters, 8, async (player) => projectPlayer(game, side, player));
  return rows.filter((row): row is NhlSkater => row != null);
}

async function projectPlayer(game: NhlGame, side: Side, player: RosterAthlete): Promise<NhlSkater | null> {
  if (!player.id) return null;
  const name = player.displayName || player.fullName;
  if (!name) return null;
  const posAbbr = player.position?.abbreviation ?? "F";
  let season = { gp: 0, sog: 0, pts: 0, goals: 0 };
  let career = { gp: 0, sog: 0, pts: 0, goals: 0 };
  try {
    const overview = await getJson<Overview>(`${OVERVIEW}/${player.id}/overview`);
    season = splitNums(overview.statistics, "Regular Season") ?? season;
    career = splitNums(overview.statistics, "Career") ?? career;
  } catch {
    /* still list the skater on the prior */
  }
  const projected = projectSkater({
    gp: season.gp,
    seasonSog: season.sog,
    careerGp: career.gp,
    careerSog: career.sog,
    seasonGoals: season.goals,
    careerGoals: career.goals,
    seasonPts: season.pts,
    careerPts: career.pts,
    home: side.home,
    pos: skaterPos(posAbbr),
  });
  const opp = side.home ? game.away : game.home;
  return {
    id: player.id,
    name,
    team: side.abbr,
    opp,
    pos: posAbbr,
    home: side.home,
    gameId: game.id,
    gameLabel: `${game.away} at ${game.home}`,
    start: game.start,
    gp: season.gp,
    careerGp: career.gp,
    ...projected,
  };
}

function buildSlip(skaters: NhlSkater[]): NhlSlip | null {
  const used = new Set<string>();
  const legs: NhlSkater[] = [];
  for (const skater of skaters) {
    if (skater.careerGp < 40) continue;
    if (skater.pShots15 < 0.62) continue;
    if (used.has(skater.gameId)) continue;
    used.add(skater.gameId);
    legs.push(skater);
    if (legs.length === 3) break;
  }
  if (legs.length < 3) return null;
  const sweep = slipSweep(legs.map((leg) => leg.pShots15));
  return {
    title: "Sunday shot 3",
    market: "Over 1.5 shots",
    sweep,
    note: "Three games. The bet is two shots, not a goal. Books usually juice 1.5. Take it only if the price is shorter than the probability on the card.",
    legs,
  };
}
