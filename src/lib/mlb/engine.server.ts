import { parkFactors, windCarry, normAbbr } from "./parks";
import { abbrOf, clamp, handCode, int, namesMatch, num, seasonFromDate, shiftDate } from "./parse";
import {
  hrDrought,
  isOpener,
  isShortStart,
  leanFrom,
  platoonEdge,
  recencyFlags,
  reversePlatoon,
  scoreFantasy,
  scoreHits,
  scoreHomeRun,
  scoreHrRbi,
  scoreRbi,
  scoreRuns,
  scoreSb,
  scoreStrikeouts,
  scoreTotalBases,
} from "./score";
import { loadPitchMaps, loadSaberMaps } from "./savant.server";
import { loadEdgeMaps, type EdgeMaps } from "./edges.server";
import { loadRotowireLineups, rwByAbbr, type RotowireGame } from "./rotowire.server";
import { groupPrizePicks, loadPrizePicks, matchPpRows, playableLine } from "./prizepicks.server";
import { buildSlips, gradeSlips, type BoxActual } from "./slips";
import { matchupOf } from "./pitches";
import type {
  AnalysisResult,
  ArsenalCard,
  BatterPick,
  BatterSeason,
  EdgeRow,
  GameCard,
  GradedPublished,
  LineupSpot,
  PitcherCard,
  PitcherHandSplit,
  PitcherPick,
  PropEdge,
  SaberRow,
  SlateResult,
  SlipCard,
  SplitCard,
  TeamSide,
  WeatherSnap,
} from "./types";

const MLB = "https://statsapi.mlb.com/api/v1";
const UA = "BlastRadius/2.0 (home-run desk)";

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

async function mlb<T>(path: string): Promise<T> {
  const url = path.startsWith("http") ? path : `${MLB}${path}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": UA },
    signal: AbortSignal.timeout(14000),
  });
  if (!res.ok) throw new Error(`MLB ${res.status} ${path.split("?")[0]}`);
  return (await res.json()) as T;
}

type MlbSchedule = {
  dates?: Array<{
    games?: Array<Record<string, unknown>>;
  }>;
};

type StatSplit = {
  player?: { id: number; fullName: string };
  team?: { id: number; name?: string; abbreviation?: string; teamCode?: string };
  stat?: Record<string, unknown>;
  position?: { abbreviation?: string };
};

type StatsPayload = { stats?: Array<{ splits?: StatSplit[] }> };

type Person = {
  id: number;
  fullName: string;
  batSide?: { code?: string };
  pitchHand?: { code?: string };
  primaryPosition?: { abbreviation?: string };
  stats?: Array<{
    group?: { displayName?: string };
    splits?: Array<{ stat?: Record<string, unknown> }>;
  }>;
};

function splitsOf(payload: StatsPayload): StatSplit[] {
  return payload.stats?.[0]?.splits ?? [];
}

function seasonOf(stat: Record<string, unknown> | undefined): BatterSeason {
  const s = stat ?? {};
  const avg = num(s.avg);
  const slg = num(s.slg);
  return {
    pa: int(s.plateAppearances),
    ab: int(s.atBats),
    hr: int(s.homeRuns),
    hits: int(s.hits),
    avg,
    obp: num(s.obp),
    slg,
    iso: clamp(slg - avg, 0, 1),
    ops: num(s.ops),
    rbi: int(s.rbi),
    runs: int(s.runs),
    sb: int(s.stolenBases),
    k: int(s.strikeOuts),
    tb: int(s.totalBases),
    babip: num(s.babip),
    abPerHr: num(s.atBatsPerHomeRun),
  };
}

function blankPitcher(id: number, name: string): PitcherCard {
  return {
    id,
    name,
    hand: null,
    era: 0,
    hr9: 1.15,
    k9: 8.5,
    whip: 1.25,
    hits9: 8.4,
    goAo: 1,
    ip: 0,
    hr: 0,
    k: 0,
    gamesStarted: 0,
    gamesPlayed: 0,
    opener: false,
    xera: null,
    arsenal: [],
    vsL: null,
    vsR: null,
    sbRate: null,
    recentK9: null,
    recentIp: null,
  };
}

function pitcherFromStat(id: number, name: string, hand: PitcherCard["hand"], stat: Record<string, unknown>): PitcherCard {
  return {
    ...blankPitcher(id, name),
    hand,
    era: num(stat.era),
    hr9: num(stat.homeRunsPer9),
    k9: num(stat.strikeoutsPer9Inn),
    whip: num(stat.whip),
    hits9: num(stat.hitsPer9Inn),
    goAo: num(stat.groundOutsToAirouts) || 1,
    ip: num(stat.inningsPitched),
    hr: int(stat.homeRuns),
    k: int(stat.strikeOuts),
    gamesStarted: int(stat.gamesStarted),
    gamesPlayed: int(stat.gamesPlayed) || int(stat.gamesPitched) || int(stat.gamesStarted),
    opener: false,
  };
}

function asTeam(raw: Record<string, unknown>): { id: number; name: string; abbreviation?: string; teamCode?: string } {
  const team = (raw.team ?? raw) as Record<string, unknown>;
  return {
    id: int(team.id),
    name: String(team.name ?? "Team"),
    abbreviation: typeof team.abbreviation === "string" ? team.abbreviation : undefined,
    teamCode: typeof team.teamCode === "string" ? team.teamCode : undefined,
  };
}

export async function fetchSlate(date: string): Promise<SlateResult> {
  return cached(`slate:${date}:v5`, 4 * 60_000, () => loadSlate(date));
}

async function loadSlate(date: string): Promise<SlateResult> {
  const [payload, rw] = await Promise.all([
    mlb<MlbSchedule>(`/schedule?sportId=1&date=${date}&hydrate=probablePitcher,venue(location),team,linescore,lineups`),
    loadRotowireLineups(date).catch(() => [] as RotowireGame[]),
  ]);
  const raw = payload.dates?.[0]?.games ?? [];
  const games = raw.map((g) => mapGame(g, date));
  attachRotowire(games, rw);
  attachMlbLineups(games, raw);
  return {
    date,
    games,
    source: rw.length ? "MLB Stats API + RotoWire lineups" : "MLB Stats API schedule",
  };
}

function mapGame(g: Record<string, unknown>, date: string): GameCard {
  const teams = g.teams as {
    away: Record<string, unknown>;
    home: Record<string, unknown>;
  };
  const venue = (g.venue ?? {}) as Record<string, unknown>;
  const loc = (venue.location ?? {}) as Record<string, unknown>;
  const coords = (loc.defaultCoordinates ?? {}) as { latitude?: number; longitude?: number };
  const venueId = int(venue.id);
  const elevationFt = int(loc.elevation);
  const azimuth = loc.azimuthAngle == null ? null : num(loc.azimuthAngle);
  const status = (g.status ?? {}) as Record<string, unknown>;
  const parks = parkFactors(venueId, elevationFt || undefined);

  return {
    gamePk: int(g.gamePk),
    date,
    gameDate: String(g.gameDate ?? ""),
    status: String(status.detailedState ?? "Scheduled"),
    abstractState: String(status.abstractGameState ?? "Preview"),
    dayNight: String(g.dayNight ?? "night"),
    venueId,
    venueName: String(venue.name ?? "Ballpark"),
    city: String(loc.city ?? ""),
    parkHrFactor: parks.hr,
    parkHitsFactor: parks.hits,
    parkKFactor: parks.k,
    parkSbFactor: parks.sb,
    elevationFt,
    azimuth,
    weather: null,
    umpire: null,
    away: mapSide(teams.away),
    home: mapSide(teams.home),
    lat: num(coords.latitude) || null,
    lon: num(coords.longitude) || null,
  };
}

function mapSide(side: Record<string, unknown>): TeamSide {
  const team = asTeam(side);
  const rec = (side.leagueRecord ?? {}) as Record<string, unknown>;
  const probable = side.probablePitcher as { id?: number; fullName?: string } | undefined;
  return {
    id: team.id,
    name: team.name,
    abbr: abbrOf(team),
    wins: int(rec.wins),
    losses: int(rec.losses),
    probable: probable?.id ? blankPitcher(probable.id, String(probable.fullName ?? "TBD")) : null,
    lineup: null,
    lineupStatus: "none",
    score: side.score == null || side.score === "" ? null : int(side.score),
  };
}

function attachRotowire(games: GameCard[], rw: RotowireGame[]) {
  if (!rw.length) return;
  const byAbbr = rwByAbbr(rw);
  for (const g of games) {
    const away = byAbbr.get(normAbbr(g.away.abbr));
    const home = byAbbr.get(normAbbr(g.home.abbr));
    if (away) {
      g.away.lineup = away.lineup;
      g.away.lineupStatus = away.status;
    }
    if (home) {
      g.home.lineup = home.lineup;
      g.home.lineupStatus = home.status;
    }
    g.umpire = away?.umpire ?? home?.umpire ?? null;
    if (!g.weather && (away?.weather || home?.weather)) {
      g.weather = away?.weather ?? home?.weather ?? null;
    }
  }
}

function mapMlbLineup(players: Array<{ id?: number; fullName?: string; primaryPosition?: { abbreviation?: string } }>): LineupSpot[] {
  return players.slice(0, 9).map((p, i) => ({
    slot: i + 1,
    playerId: p.id ?? null,
    name: p.fullName ?? "",
    pos: p.primaryPosition?.abbreviation ?? "",
    batSide: null,
  }));
}

function attachMlbLineups(games: GameCard[], raw: Array<Record<string, unknown>>) {
  const byPk = new Map(games.map((g) => [g.gamePk, g]));
  for (const g of raw) {
    const card = byPk.get(int(g.gamePk));
    if (!card) continue;
    const lu = g.lineups as { homePlayers?: Array<{ id?: number; fullName?: string; primaryPosition?: { abbreviation?: string } }>; awayPlayers?: Array<{ id?: number; fullName?: string; primaryPosition?: { abbreviation?: string } }> } | undefined;
    if (lu?.homePlayers && lu.homePlayers.length >= 8) {
      card.home.lineup = mapMlbLineup(lu.homePlayers);
      card.home.lineupStatus = "confirmed";
    }
    if (lu?.awayPlayers && lu.awayPlayers.length >= 8) {
      card.away.lineup = mapMlbLineup(lu.awayPlayers);
      card.away.lineupStatus = "confirmed";
    }
  }
}

async function fetchWeather(games: Array<GameCard & { lat?: number | null; lon?: number | null }>): Promise<void> {
  const unique = new Map<number, { lat: number; lon: number; game: GameCard }>();
  for (const g of games) {
    if (g.lat && g.lon && !unique.has(g.venueId)) unique.set(g.venueId, { lat: g.lat, lon: g.lon, game: g });
  }
  if (unique.size === 0) return;

  const lats = [...unique.values()].map((v) => v.lat).join(",");
  const lons = [...unique.values()].map((v) => v.lon).join(",");
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&hourly=temperature_2m,wind_speed_10m,wind_direction_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&forecast_days=2&timezone=America/New_York`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { "User-Agent": UA } });
    if (!res.ok) return;
    const body = (await res.json()) as unknown;
    const rows = Array.isArray(body) ? body : [body];
    const venues = [...unique.values()];
    rows.forEach((row, i) => {
      const g = venues[i]?.game;
      if (!g || !row || typeof row !== "object") return;
      const hourly = (row as { hourly?: { time?: string[]; temperature_2m?: number[]; wind_speed_10m?: number[]; wind_direction_10m?: number[] } }).hourly;
      if (!hourly?.time?.length) return;
      const target = g.gameDate ? new Date(g.gameDate) : new Date();
      let best = 0;
      let bestDiff = Infinity;
      hourly.time.forEach((t, idx) => {
        const diff = Math.abs(new Date(t).getTime() - target.getTime());
        if (diff < bestDiff) {
          bestDiff = diff;
          best = idx;
        }
      });
      const tempF = hourly.temperature_2m?.[best] ?? null;
      const windMph = hourly.wind_speed_10m?.[best] ?? null;
      const windDir = hourly.wind_direction_10m?.[best] ?? null;
      const { carry, label } = windCarry({
        windMph,
        windFromDeg: windDir,
        azimuth: g.azimuth,
        tempF,
        elevationFt: g.elevationFt,
      });
      const snap: WeatherSnap = { tempF, windMph, windDir, windLabel: label, carry };
      for (const game of games) {
        if (game.venueId === g.venueId) game.weather = snap;
      }
    });
  } catch {
    // Weather is additive; skip on throttle.
  }
}

async function teamHitting(season: number, teamId: number): Promise<StatSplit[]> {
  try {
    const data = await mlb<StatsPayload>(
      `/stats?stats=season&group=hitting&season=${season}&gameType=R&sportId=1&teamId=${teamId}&limit=50&playerPool=all`,
    );
    return splitsOf(data);
  } catch {
    return [];
  }
}

async function lastTenHitting(season: number, teamIds: number[]): Promise<Map<number, StatSplit>> {
  const map = new Map<number, StatSplit>();
  await Promise.all(
    teamIds.map(async (teamId) => {
      try {
        const data = await mlb<StatsPayload>(
          `/stats?stats=lastXGames&group=hitting&season=${season}&sportId=1&teamId=${teamId}&limit=50`,
        );
        for (const split of splitsOf(data)) {
          if (split.player?.id) map.set(split.player.id, split);
        }
      } catch {
        /* skip team */
      }
    }),
  );
  return map;
}

async function lastWeekHitting(
  season: number,
  date: string,
  teamIds: number[],
): Promise<Map<number, { hr: number; pa: number; games: number; avg: number; hits: number; tb: number; rbi: number; runs: number }>> {
  const start = shiftDate(date, -6);
  const end = shiftDate(date, -1);
  const map = new Map<number, { hr: number; pa: number; games: number; avg: number; hits: number; tb: number; rbi: number; runs: number }>();
  await Promise.all(
    teamIds.map(async (teamId) => {
      try {
        const data = await mlb<StatsPayload>(
          `/stats?stats=byDateRange&group=hitting&season=${season}&gameType=R&sportId=1&teamId=${teamId}&startDate=${start}&endDate=${end}&limit=50&playerPool=all`,
        );
        for (const split of splitsOf(data)) {
          const id = split.player?.id;
          if (!id || !split.stat) continue;
          map.set(id, {
            hr: int(split.stat.homeRuns),
            pa: int(split.stat.plateAppearances),
            games: int(split.stat.gamesPlayed),
            avg: num(split.stat.avg),
            hits: int(split.stat.hits),
            tb: int(split.stat.totalBases),
            rbi: int(split.stat.rbi),
            runs: int(split.stat.runs),
          });
        }
      } catch {
        /* skip team */
      }
    }),
  );
  return map;
}

async function lastTenPitching(season: number): Promise<Map<number, { k9: number; ip: number; k: number }>> {
  try {
    const data = await mlb<StatsPayload>(
      `/stats?stats=lastXGames&group=pitching&season=${season}&sportId=1&limit=250`,
    );
    const map = new Map<number, { k9: number; ip: number; k: number }>();
    for (const split of splitsOf(data)) {
      const id = split.player?.id;
      if (!id || !split.stat) continue;
      const ip = num(split.stat.inningsPitched);
      const games = Math.max(int(split.stat.gamesStarted) || int(split.stat.gamesPlayed) || int(split.stat.gamesPitched), 1);
      map.set(id, {
        k9: num(split.stat.strikeoutsPer9Inn),
        ip: ip / games,
        k: int(split.stat.strikeOuts),
      });
    }
    return map;
  } catch {
    return new Map();
  }
}

async function hydratePeople(ids: number[], season: number): Promise<Map<number, Person>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const out = new Map<number, Person>();
  const chunks: number[][] = [];
  for (let i = 0; i < unique.length; i += 40) chunks.push(unique.slice(i, i + 40));
  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const data = await mlb<{ people?: Person[] }>(
          `/people?personIds=${chunk.join(",")}&hydrate=stats(group=[hitting,pitching],type=[season],season=${season})`,
        );
        for (const p of data.people ?? []) out.set(p.id, p);
      } catch {
        /* skip chunk */
      }
    }),
  );
  return out;
}

function pitchingStat(person: Person | undefined): Record<string, unknown> | undefined {
  const groups = person?.stats ?? [];
  const pitching = groups.find((g) => g.group?.displayName?.toLowerCase().includes("pitch"));
  return pitching?.splits?.[0]?.stat;
}

async function boxActuals(games: GameCard[]): Promise<Map<number, BoxActual>> {
  const map = new Map<number, BoxActual>();
  const finals = games.filter((g) => g.abstractState === "Final" || g.abstractState === "Live");
  await Promise.all(
    finals.map(async (g) => {
      try {
        const box = await mlb<{
          teams?: {
            away?: { players?: Record<string, { person?: { id?: number }; stats?: { batting?: Record<string, unknown>; pitching?: Record<string, unknown> } }> };
            home?: { players?: Record<string, { person?: { id?: number }; stats?: { batting?: Record<string, unknown>; pitching?: Record<string, unknown> } }> };
          };
        }>(`/game/${g.gamePk}/boxscore`);
        for (const side of [box.teams?.away?.players, box.teams?.home?.players]) {
          if (!side) continue;
          for (const row of Object.values(side)) {
            const id = row.person?.id;
            if (!id) continue;
            const b = row.stats?.batting;
            const p = row.stats?.pitching;
            const cur = map.get(id) ?? { hr: 0, hits: 0, tb: 0, rbi: 0, sb: 0, k: 0, runs: 0, pa: 0, pitcherK: 0, inProgress: false };
            if (b && Object.keys(b).length) {
              cur.hr = int(b.homeRuns);
              cur.hits = int(b.hits);
              cur.tb = int(b.totalBases);
              cur.rbi = int(b.rbi);
              cur.sb = int(b.stolenBases);
              cur.k = int(b.strikeOuts);
              cur.runs = int(b.runs);
              cur.pa = int(b.plateAppearances);
            }
            if (p && Object.keys(p).length) {
              cur.pitcherK = int(p.strikeOuts);
            }
            if (g.abstractState === "Live") cur.inProgress = true;
            if (cur.pa || cur.pitcherK || cur.inProgress) map.set(id, cur);
          }
        }
      } catch {
        /* ignore */
      }
    }),
  );
  return map;
}

async function deskNotes(result: AnalysisResult): Promise<void> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return;
  const top = result.picks.hr.slice(0, 8).map((p) => ({
    id: p.playerId,
    name: p.name,
    team: p.teamAbbr,
    score: p.score,
    reasons: p.reasons,
    vs: p.pitcherName,
    park: p.venueName,
    edge: p.edge
      ? {
          vsHand: p.edge.vsHand?.slg,
          fb: p.edge.fbRate,
          sprint: p.edge.sprint,
        }
      : null,
  }));
  const games = result.games.map((g) => `${g.away.abbr}@${g.home.abbr} ${g.venueName} park ${g.parkHrFactor}/${g.parkHitsFactor}`);
  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(18000),
      body: JSON.stringify({
        model: "grok-4.5",
        max_tokens: 700,
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content:
              "You are a concise MLB desk editor. Return JSON only. No betting advice as guarantees. Tone: dry, specific, no emoji.",
          },
          {
            role: "user",
            content: JSON.stringify({
              instruction:
                'Write {"briefing": "2-3 sentences on the slate", "notes": [{"id": number, "note": "one specific sentence"}]} for the home-run board. Notes must cite a real factor from the payload.',
              games,
              top,
              edges: result.edges.slice(0, 8).map((e) => ({ title: e.title, detail: e.detail })),
            }),
          },
        ],
      }),
    });
    if (!res.ok) return;
    const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = body.choices?.[0]?.message?.content ?? "";
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    if (jsonStart < 0 || jsonEnd < 0) return;
    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as {
      briefing?: string;
      notes?: Array<{ id?: number; note?: string }>;
    };
    result.briefing = parsed.briefing?.trim() || result.briefing;
    const byId = new Map((parsed.notes ?? []).map((n) => [n.id, n.note ?? ""]));
    for (const pick of result.picks.hr) {
      const note = byId.get(pick.playerId);
      if (note) pick.note = note;
    }
  } catch {
    /* optional */
  }
}

function vsHandCode(pitcherHand: PitcherCard["hand"]): "vl" | "vr" | null {
  if (pitcherHand === "L") return "vl";
  if (pitcherHand === "R") return "vr";
  return null;
}

function batterVsPitcher(batSide: BatterPick["batSide"]): "vl" | "vr" | null {
  if (batSide === "L") return "vl";
  if (batSide === "R") return "vr";
  return null;
}

function pickHandSplit(hands: { vl: SplitCard | null; vr: SplitCard | null } | undefined, code: "vl" | "vr" | null): SplitCard | null {
  if (!hands || !code) return null;
  return hands[code];
}

function pickPitcherHand(
  hands: { vl: PitcherHandSplit | null; vr: PitcherHandSplit | null } | undefined,
  code: "vl" | "vr" | null,
): PitcherHandSplit | null {
  if (!hands || !code) return null;
  return hands[code];
}

function buildEdge(
  playerId: number,
  batSide: BatterPick["batSide"],
  pitcher: PitcherCard | null,
  isHome: boolean,
  teamId: number,
  oppAbbr: string,
  maps: EdgeMaps,
): PropEdge {
  const handCodeVs = vsHandCode(pitcher?.hand ?? null);
  const vsHand = pickHandSplit(maps.batterHands.get(playerId), handCodeVs);
  const haCode = isHome ? "h" : "a";
  const ha = maps.batterHA.get(playerId)?.[haCode] ?? null;
  const batted = maps.batted.get(playerId);
  const sprint = maps.sprint.get(playerId);
  const run = pitcher ? maps.pitcherRun.get(pitcher.id) : undefined;
  const catcher = maps.catcherByTeam.get(normAbbr(oppAbbr));
  const vsBatter = batterVsPitcher(batSide === "S" ? (pitcher?.hand === "L" ? "R" : "L") : batSide);
  const pHand = pickPitcherHand(pitcher ? maps.pitcherHands.get(pitcher.id) : undefined, vsBatter);
  return {
    vsHand,
    vsHandCode: handCodeVs,
    ha,
    haCode,
    fbRate: batted?.fb ?? null,
    gbRate: batted?.gb ?? null,
    ldRate: batted?.ld ?? null,
    pullRate: batted?.pull ?? null,
    sprint: sprint?.speed ?? null,
    hpTo1b: sprint?.hpTo1b ?? null,
    bolts: sprint?.bolts ?? null,
    pitcherSbRate: run?.rate ?? pitcher?.sbRate ?? null,
    catcherCs: catcher?.cs ?? null,
    catcherPop: catcher?.pop ?? null,
    catcherArm: catcher?.arm ?? null,
    catcherName: catcher?.name ?? null,
    teamObp: maps.teamObp.get(teamId) ?? null,
    pitcherVsHandHr9: pHand?.hr9 ?? null,
    pitcherVsHandHits9: pHand?.hits9 ?? null,
    pitcherVsHandK9: pHand?.k9 ?? null,
    pitcherK9: pitcher?.k9 ?? null,
    pitcherWhip: pitcher?.whip ?? null,
    pitcherXera: pitcher?.xera ?? pitcher?.era ?? null,
  };
}

function lastName(name: string): string {
  return name.split(" ").slice(-1)[0] ?? name;
}

function orderRoster(
  team: TeamSide,
  pool: Array<{
    playerId: number;
    name: string;
    teamId: number;
    teamAbbr: string;
    pos: string;
    season: BatterSeason;
    batSide: "L" | "R" | "S" | null;
  }>,
): { roster: typeof pool; lined: Set<number> } {
  const lined = new Set<number>();
  if (!team.lineup?.length) return { roster: pool.slice(0, 11), lined };
  const used = new Set<number>();
  const out: typeof pool = [];
  for (const spot of team.lineup) {
    const hit = pool.find(
      (c) => !used.has(c.playerId) && ((spot.playerId != null && c.playerId === spot.playerId) || namesMatch(c.name, spot.name)),
    );
    if (!hit) continue;
    used.add(hit.playerId);
    lined.add(hit.playerId);
    out.push({
      ...hit,
      pos: spot.pos || hit.pos,
      batSide: spot.batSide ?? hit.batSide,
    });
  }
  if (out.length >= 6) return { roster: out, lined };
  for (const c of pool) {
    if (out.length >= 9) break;
    if (used.has(c.playerId)) continue;
    used.add(c.playerId);
    lined.add(c.playerId);
    out.push(c);
  }
  if (!out.length) {
    const fallback = pool.slice(0, 9);
    fallback.forEach((b) => lined.add(b.playerId));
    return { roster: fallback, lined };
  }
  return { roster: out, lined };
}

function takeTop<T>(rows: T[], n: number): T[] {
  return rows.slice(0, n);
}

function buildEdgesBoard(opts: {
  hr: BatterPick[];
  hits: BatterPick[];
  tb: BatterPick[];
  rbi: BatterPick[];
  sb: BatterPick[];
  k: PitcherPick[];
}): EdgeRow[] {
  const { hr, rbi, sb, k } = opts;
  const out: EdgeRow[] = [];

  const uniqueBatters = new Map<number, BatterPick>();
  for (const pick of hr) {
    if (!uniqueBatters.has(pick.playerId)) uniqueBatters.set(pick.playerId, pick);
  }

  const platoon = [...uniqueBatters.values()]
    .filter((p) => p.edge?.vsHand && p.edge.vsHand.pa >= 40)
    .map((p) => {
      const split = p.edge!.vsHand!;
      const delta = split.iso - p.season.iso;
      return {
        pick: p,
        score: Math.round(clamp(55 + delta * 220 + (split.slg - 0.4) * 40, 20, 96)),
        detail: `${split.slg.toFixed(3)} SLG / ${split.iso.toFixed(3)} ISO vs ${p.edge?.vsHandCode === "vl" ? "LHP" : "RHP"} (${split.pa} PA)`,
      };
    })
    .sort((a, b) => b.score - a.score);

  for (const row of takeTop(platoon, 3)) {
    out.push(edgeOf(row.pick, "platoon", "hr", `Platoon vs ${row.pick.pitcherHand === "L" ? "LHP" : "RHP"}`, row.detail, row.score));
  }

  const steal = sb
    .filter((p) => (p.edge?.sprint ?? 0) >= 27 || p.season.sb >= 8)
    .map((p) => {
      const sprint = p.edge?.sprint ?? 26;
      const leak = (p.edge?.pitcherSbRate ?? 0.008) * 100;
      const cs = p.edge?.catcherCs ?? 0.22;
      const score = Math.round(clamp(20 + (sprint - 26.5) * 18 + leak * 8 + (0.28 - cs) * 80 + (p.season.sb > 10 ? 6 : 0), 18, 96));
      const catcher = p.edge?.catcherName ? p.edge.catcherName.split(",")[0].trim() : "catcher";
      const detail = `${sprint.toFixed(1)} ft/s · pitcher ${(p.edge?.pitcherSbRate != null ? (p.edge.pitcherSbRate * 100).toFixed(1) : "—")}% att · ${catcher} ${p.edge?.catcherCs != null ? `${(p.edge.catcherCs * 100).toFixed(0)}% CS` : "—"}`;
      return { pick: p, score, detail };
    })
    .sort((a, b) => b.score - a.score);

  for (const row of takeTop(steal, 3)) {
    out.push(edgeOf(row.pick, "steal", "sb", "Steal climate", row.detail, row.score));
  }

  const fly = [...uniqueBatters.values()]
    .filter((p) => (p.edge?.fbRate ?? 0) >= 24 && p.parkHrFactor >= 104)
    .map((p) => {
      const fb = p.edge?.fbRate ?? 24;
      const pull = p.edge?.pullRate ?? 40;
      const score = Math.round(clamp((fb - 20) * 2.2 + (p.parkHrFactor - 100) * 1.6 + (pull - 38) * 0.4, 20, 96));
      return {
        pick: p,
        score,
        detail: `${fb.toFixed(0)}% fly balls at ${p.venueName.split(" ").slice(0, 2).join(" ")} (${p.parkHrFactor} HR park)${p.edge?.pullRate != null ? ` · ${p.edge.pullRate.toFixed(0)}% pull` : ""}`,
      };
    })
    .sort((a, b) => b.score - a.score);

  for (const row of takeTop(fly, 3)) {
    out.push(edgeOf(row.pick, "fly", "hr", "Fly-ball park", row.detail, row.score));
  }

  const mix = [...uniqueBatters.values()]
    .filter((p) => (p.mixBarrel != null && p.mixBarrel >= 8.2) || (p.matchup?.batterXslg != null && p.matchup.batterXslg >= 0.48 && p.matchup.usage >= 28))
    .map((p) => {
      const brl = p.mixBarrel ?? 6.5;
      const m = p.matchup;
      const score = Math.round(clamp((brl - 6) * 6 + ((m?.batterXslg ?? 0.4) - 0.4) * 80, 22, 96));
      return {
        pick: p,
        score,
        detail:
          p.mixBarrel != null
            ? `${p.mixBarrel.toFixed(1)} mix barrel · ${p.hrMult.toFixed(2)} HR mult vs ${p.pitcherName ? lastName(p.pitcherName) : "the mix"}`
            : `${m!.batterXslg!.toFixed(3)} xSLG vs ${m!.code} (${m!.usage.toFixed(0)}%)`,
      };
    })
    .sort((a, b) => b.score - a.score);

  for (const row of takeTop(mix, 3)) {
    out.push(edgeOf(row.pick, "mix", "hr", "Pitch-mix mash", row.detail, row.score));
  }

  const climate = [...k]
    .map((p) => {
      const park = p.parkKFactor;
      const score = Math.round(clamp((p.pitcher.k9 - 8) * 8 + (park - 100) * 1.4 + (p.oppKRate - 0.21) * 180, 18, 96));
      return {
        pick: p,
        score,
        detail: `${p.pitcher.k9.toFixed(1)} K/9 in a ${park} K park · opp K ${(p.oppKRate * 100).toFixed(1)}%`,
      };
    })
    .sort((a, b) => b.score - a.score);

  for (const row of takeTop(climate, 2)) {
    const p = row.pick;
    out.push({
      id: `climate-${p.playerId}`,
      kind: "climate",
      title: "K climate",
      detail: row.detail,
      score: row.score,
      market: "k",
      playerId: p.playerId,
      name: p.name,
      teamAbbr: p.teamAbbr,
      opponentAbbr: p.opponentAbbr,
      venueName: p.venueName,
      pitcherName: p.name,
    });
  }

  const luck = [...uniqueBatters.values()]
    .filter((p) => p.saber?.xslg != null && !hrDrought(p.recent))
    .map((p) => {
      const delta = p.season.slg - (p.saber?.xslg ?? p.season.slg);
      return {
        pick: p,
        score: Math.round(clamp(50 - delta * 180, 18, 96)),
        delta,
        detail: `SLG ${p.season.slg.toFixed(3)} vs xSLG ${p.saber!.xslg!.toFixed(3)} (${delta >= 0 ? "+" : ""}${delta.toFixed(3)})`,
      };
    })
    .filter((row) => row.delta <= -0.025)
    .sort((a, b) => a.delta - b.delta);

  for (const row of takeTop(luck, 3)) {
    out.push(edgeOf(row.pick, "luck", "tb", "Due on contact", row.detail, row.score));
  }

  const home = [...uniqueBatters.values()]
    .filter((p) => p.isHome && p.edge?.ha && p.edge.ha.pa >= 40)
    .map((p) => {
      const ha = p.edge!.ha!;
      const delta = ha.ops - p.season.ops;
      return {
        pick: p,
        score: Math.round(clamp(48 + delta * 160 + (ha.ops - 0.75) * 30, 18, 96)),
        delta,
        detail: `${ha.ops.toFixed(3)} OPS at home (${ha.pa} PA) vs ${p.season.ops.toFixed(3)} season`,
      };
    })
    .filter((row) => row.delta >= 0.03)
    .sort((a, b) => b.score - a.score);

  for (const row of takeTop(home, 2)) {
    out.push(edgeOf(row.pick, "home", "hits", "Home split", row.detail, row.score));
  }

  const rbiEdges = rbi
    .filter((p) => p.lineupSlot >= 2 && p.lineupSlot <= 5 && (p.edge?.teamObp ?? 0) >= 0.318)
    .map((p) => {
      const obp = p.edge?.teamObp ?? 0.31;
      const score = Math.round(clamp((obp - 0.3) * 400 + (5 - Math.abs(3.5 - p.lineupSlot)) * 6 + p.season.iso * 40, 18, 94));
      return {
        pick: p,
        score,
        detail: `Slot ${p.lineupSlot} with ${obp.toFixed(3)} team OBP · ${p.season.rbi} RBI`,
      };
    })
    .sort((a, b) => b.score - a.score);

  for (const row of takeTop(rbiEdges, 2)) {
    out.push(edgeOf(row.pick, "rbi", "rbi", "RBI table", row.detail, row.score));
  }

  // Deduplicate player+kind and keep the strongest ~20.
  const seen = new Set<string>();
  const unique: EdgeRow[] = [];
  for (const row of out.sort((a, b) => b.score - a.score)) {
    const key = `${row.kind}:${row.playerId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }
  return unique.slice(0, 20).map((row, i) => ({ ...row, score: row.score, id: `${row.id}-${i}` }));
}

function edgeOf(pick: BatterPick, kind: EdgeRow["kind"], market: EdgeRow["market"], title: string, detail: string, score: number): EdgeRow {
  return {
    id: `${kind}-${pick.playerId}`,
    kind,
    title,
    detail,
    score,
    market,
    playerId: pick.playerId,
    name: pick.name,
    teamAbbr: pick.teamAbbr,
    opponentAbbr: pick.opponentAbbr,
    venueName: pick.venueName,
    pitcherName: pick.pitcherName,
  };
}

export async function runAnalysis(date: string): Promise<AnalysisResult> {
  return cached(`analyze:${date}:v35`, 8 * 60_000, () => buildAnalysis(date));
}

async function buildAnalysis(date: string): Promise<AnalysisResult> {
  const season = seasonFromDate(date);
  const slate = await loadSlate(date);
  const games = slate.games as Array<GameCard & { lat?: number | null; lon?: number | null }>;

  const teamIds = [...new Set(games.flatMap((g) => [g.away.id, g.home.id]))];
  const pitcherIds = games.flatMap((g) => [g.away.probable?.id, g.home.probable?.id]).filter((id): id is number => !!id);

  const [teamHits, recentMap, weekMap, recentPitch, saberMaps, pitchMaps, edgeMaps, prizePicks] = await Promise.all([
    Promise.all(teamIds.map((id) => teamHitting(season, id))).then((rows) => rows.flat()),
    lastTenHitting(season, teamIds),
    lastWeekHitting(season, date, teamIds),
    lastTenPitching(season),
    loadSaberMaps(season).catch(() => ({ batters: new Map(), pitchers: new Map() })),
    loadPitchMaps(season).catch(() => ({ pitcherPitches: new Map(), batterPitches: new Map() })),
    loadEdgeMaps(season).catch(() => ({
      sprint: new Map(),
      batted: new Map(),
      pitcherRun: new Map(),
      catcherByTeam: new Map(),
      batterHands: new Map(),
      batterHA: new Map(),
      pitcherHands: new Map(),
      teamObp: new Map(),
    }) satisfies EdgeMaps),
    loadPrizePicks(date).catch(() => []),
    fetchWeather(games),
  ]);

  let hittingSplits = teamHits;
  if (hittingSplits.length < 24 && teamIds.length) {
    try {
      const globalHits = await mlb<StatsPayload>(
        `/stats?stats=season&group=hitting&season=${season}&gameType=R&sportId=1&limit=400`,
      );
      const wanted = new Set(teamIds);
      hittingSplits = splitsOf(globalHits).filter((s) => s.team?.id && wanted.has(s.team.id));
    } catch {
      /* keep teamHits */
    }
  }

  const batterIds = hittingSplits.map((s) => s.player?.id).filter((id): id is number => !!id);
  const people = await hydratePeople([...batterIds, ...pitcherIds], season);
  const actuals = await boxActuals(games);

  const pitchers = new Map<number, PitcherCard>();
  for (const id of pitcherIds) {
    const person = people.get(id);
    const stat = pitchingStat(person);
    const name = person?.fullName ?? games.flatMap((g) => [g.away.probable, g.home.probable]).find((p) => p?.id === id)?.name ?? "TBD";
    const card = pitcherFromStat(id, name, handCode(person?.pitchHand), stat ?? {});
    card.xera = saberMaps.pitchers.get(id) ?? null;
    card.arsenal = pitchMaps.pitcherPitches.get(id) ?? [];
    card.vsL = edgeMaps.pitcherHands.get(id)?.vl ?? null;
    card.vsR = edgeMaps.pitcherHands.get(id)?.vr ?? null;
    card.sbRate = edgeMaps.pitcherRun.get(id)?.rate ?? null;
    const recentP = recentPitch.get(id);
    card.recentK9 = recentP?.k9 ?? null;
    card.recentIp = recentP?.ip ?? null;
    card.opener = isOpener(card);
    pitchers.set(id, card);
  }

  for (const game of games) {
    if (game.away.probable) game.away.probable = pitchers.get(game.away.probable.id) ?? game.away.probable;
    if (game.home.probable) game.home.probable = pitchers.get(game.home.probable.id) ?? game.home.probable;
  }

  type Candidate = {
    playerId: number;
    name: string;
    teamId: number;
    teamAbbr: string;
    pos: string;
    season: BatterSeason;
    batSide: "L" | "R" | "S" | null;
  };

  const abbrByTeam = new Map<number, string>();
  for (const g of games) {
    abbrByTeam.set(g.away.id, g.away.abbr);
    abbrByTeam.set(g.home.id, g.home.abbr);
  }

  const byTeam = new Map<number, Candidate[]>();
  for (const split of hittingSplits) {
    const playerId = split.player?.id;
    const teamId = split.team?.id;
    if (!playerId || !teamId) continue;
    const pos = split.position?.abbreviation ?? people.get(playerId)?.primaryPosition?.abbreviation ?? "";
    const seasonStats = seasonOf(split.stat);
    if (pos === "P" && seasonStats.pa < 40) continue;
    if (seasonStats.pa < 15) continue;
    const cand: Candidate = {
      playerId,
      name: split.player?.fullName ?? "Player",
      teamId,
      teamAbbr: abbrByTeam.get(teamId) ?? abbrOf(split.team ?? { id: teamId }),
      pos,
      season: seasonStats,
      batSide: handCode(people.get(playerId)?.batSide),
    };
    const list = byTeam.get(teamId) ?? [];
    list.push(cand);
    byTeam.set(teamId, list);
  }

  for (const list of byTeam.values()) {
    list.sort((a, b) => b.season.pa - a.season.pa);
  }

  const hr: BatterPick[] = [];
  const hits: BatterPick[] = [];
  const tb: BatterPick[] = [];
  const rbi: BatterPick[] = [];
  const sb: BatterPick[] = [];
  const hrrbi: BatterPick[] = [];
  const runs: BatterPick[] = [];
  const fs: BatterPick[] = [];
  const kPicks: PitcherPick[] = [];
  const ppGroup = groupPrizePicks(prizePicks);

  for (const game of games) {
    const sides: Array<{ team: TeamSide; opp: TeamSide; isHome: boolean }> = [
      { team: game.home, opp: game.away, isHome: true },
      { team: game.away, opp: game.home, isHome: false },
    ];

    for (const { team, opp, isHome } of sides) {
      const ordered = orderRoster(team, byTeam.get(team.id) ?? []);
      const roster = ordered.roster;
      const pitcher = opp.probable;
      const oppKRate =
        roster.reduce((sum, b) => sum + b.season.k / Math.max(b.season.pa, 1), 0) / Math.max(roster.length, 1);

      if (pitcher && pitcher.id) {
        const scored = scoreStrikeouts(pitcher, oppKRate || 0.22, game.parkKFactor);
        kPicks.push({
          rank: 0,
          playerId: pitcher.id,
          name: pitcher.name,
          teamId: opp.id,
          teamAbbr: opp.abbr,
          opponentAbbr: team.abbr,
          gamePk: game.gamePk,
          venueName: game.venueName,
          hand: pitcher.hand,
          market: "k",
          score: scored.score,
          lean: leanFrom(scored.score),
          reasons: scored.reasons,
          factors: scored.factors,
          pitcher,
          oppKRate,
          note: null,
          parkKFactor: game.parkKFactor,
          propLine: playableLine(matchPpRows(pitcher.name, opp.abbr, ppGroup), "k"),
          actualK: actuals.get(pitcher.id)?.pitcherK ?? null,
          gameState: game.abstractState,
        });
      }

      roster.forEach((batter, index) => {
        const lineupSlot = index + 1;
        const recent = recentMap.get(batter.playerId);
        const recentSeason = recent?.stat ? seasonOf(recent.stat) : null;
        const recentHrPa = recentSeason ? recentSeason.hr / Math.max(recentSeason.pa, 1) : null;
        const recentAvg = recentSeason?.avg ?? null;
        const week = weekMap.get(batter.playerId) ?? null;
        const saber = saberMaps.batters.get(batter.playerId) ?? null;
        const vsPitches = pitchMaps.batterPitches.get(batter.playerId) ?? [];
        const edge = buildEdge(batter.playerId, batter.batSide, pitcher ?? null, isHome, batter.teamId, opp.abbr, edgeMaps);
        const flags = recencyFlags(batter.season, week);
        const reverse = reversePlatoon(batter.batSide, pitcher?.hand ?? null, edge.vsHand);
        const opener = isOpener(pitcher ?? null) || isShortStart(pitcher ?? null);
        const ctx = {
          pitcher: pitcher ?? null,
          parkHr: game.parkHrFactor,
          parkHits: game.parkHitsFactor,
          parkK: game.parkKFactor,
          parkSb: game.parkSbFactor,
          weather: game.weather,
          lineupSlot,
          platoon: reverse ? 0.66 : platoonEdge(batter.batSide, pitcher?.hand ?? null),
          saber,
          vsPitches,
          isHome,
          edge,
          flags,
          reverse,
        };

        const hrS = scoreHomeRun(batter.season, recentHrPa, ctx, week);
        const hitS = scoreHits(batter.season, recentAvg, ctx);
        const tbS = scoreTotalBases(batter.season, ctx, recentAvg);
        const rbiS = scoreRbi(batter.season, ctx);
        const sbS = scoreSb(batter.season, ctx);
        const runS = scoreRuns(batter.season, ctx);
        const comboS = scoreHrRbi(batter.season, ctx, recentAvg);
        const fsS = scoreFantasy(batter.season, ctx, recentAvg);
        const matchup = hrS.matchup ?? matchupOf(pitcher?.arsenal, vsPitches);
        const mix = hrS.mix;

        const base = {
          playerId: batter.playerId,
          name: batter.name,
          teamId: batter.teamId,
          teamAbbr: batter.teamAbbr,
          opponentAbbr: opp.abbr,
          opponentId: opp.id,
          gamePk: game.gamePk,
          venueName: game.venueName,
          batSide: batter.batSide,
          pitcherName: pitcher?.name ?? null,
          pitcherHand: pitcher?.hand ?? null,
          lineupSlot,
          season: batter.season,
          recent: {
            games: recentSeason ? Math.max(recentSeason.pa ? 10 : 0, 1) : week?.games || 0,
            hr: recentSeason?.hr ?? 0,
            avg: recentSeason?.avg ?? week?.avg ?? 0,
            hits: recentSeason?.hits ?? week?.hits ?? 0,
            pa: recentSeason?.pa ?? week?.pa ?? 0,
            tb: recentSeason?.tb ?? week?.tb ?? 0,
            rbi: recentSeason?.rbi ?? week?.rbi ?? 0,
            runs: recentSeason?.runs ?? week?.runs ?? 0,
            weekHr: week?.hr ?? recentSeason?.hr ?? 0,
            weekPa: week?.pa ?? recentSeason?.pa ?? 0,
            weekGames: week?.games ?? 0,
          },
          flags,
          reversePlatoon: reverse,
          opener,
          mixBarrel: mix.coverage > 0 ? mix.barrel : null,
          mixXwoba: mix.coverage > 0 ? mix.xwoba : null,
          dmgMult: mix.dmgMult,
          hrMult: mix.hrMult,
          gameState: game.abstractState,
          weather: game.weather,
          parkHrFactor: game.parkHrFactor,
          note: null as string | null,
          actual: actuals.has(batter.playerId)
            ? (() => {
                const a = actuals.get(batter.playerId)!;
                return { hr: a.hr, hits: a.hits, tb: a.tb, rbi: a.rbi, sb: a.sb, k: a.k, runs: a.runs, pa: a.pa };
              })()
            : null,
          saber,
          vsPitches,
          matchup,
          edge,
          isHome,
          inLineup: ordered.lined.has(batter.playerId),
          lineupStatus: team.lineupStatus,
          propLine: null,
        };

        const ppRows = matchPpRows(batter.name, batter.teamAbbr, ppGroup);
        const kicker = (market: Parameters<typeof playableLine>[1]) => playableLine(ppRows, market);

        hr.push({
          ...base,
          rank: 0,
          market: "hr",
          score: hrS.score,
          lean: leanFrom(hrS.score),
          impliedHr: hrS.impliedHr,
          hrPct: hrS.hrPct,
          reasons: hrS.reasons,
          factors: hrS.factors,
          propLine: kicker("hr"),
        });
        hits.push({
          ...base,
          rank: 0,
          market: "hits",
          score: hitS.score,
          lean: leanFrom(hitS.score),
          impliedHr: 0,
          hrPct: 0,
          reasons: hitS.reasons,
          factors: hitS.factors,
          propLine: kicker("hits"),
        });
        tb.push({
          ...base,
          rank: 0,
          market: "tb",
          score: tbS.score,
          lean: leanFrom(tbS.score),
          impliedHr: 0,
          hrPct: 0,
          reasons: tbS.reasons,
          factors: tbS.factors,
          propLine: kicker("tb"),
        });
        rbi.push({
          ...base,
          rank: 0,
          market: "rbi",
          score: rbiS.score,
          lean: leanFrom(rbiS.score),
          impliedHr: 0,
          hrPct: 0,
          reasons: rbiS.reasons,
          factors: rbiS.factors,
          propLine: kicker("rbi"),
        });
        sb.push({
          ...base,
          rank: 0,
          market: "sb",
          score: sbS.score,
          lean: leanFrom(sbS.score),
          impliedHr: 0,
          hrPct: 0,
          reasons: sbS.reasons,
          factors: sbS.factors,
          propLine: kicker("sb"),
        });
        hrrbi.push({
          ...base,
          rank: 0,
          market: "hrrbi",
          score: comboS.score,
          lean: leanFrom(comboS.score),
          impliedHr: 0,
          hrPct: 0,
          reasons: comboS.reasons,
          factors: comboS.factors,
          propLine: kicker("hrrbi"),
        });
        runs.push({
          ...base,
          rank: 0,
          market: "runs",
          score: runS.score,
          lean: leanFrom(runS.score),
          impliedHr: 0,
          hrPct: 0,
          reasons: runS.reasons,
          factors: runS.factors,
          propLine: kicker("runs"),
        });
        fs.push({
          ...base,
          rank: 0,
          market: "fs",
          score: fsS.score,
          lean: leanFrom(fsS.score),
          impliedHr: 0,
          hrPct: 0,
          reasons: fsS.reasons,
          factors: fsS.factors,
          propLine: kicker("fs"),
        });
      });
    }
  }

  const topN = <T extends { score: number; rank: number }>(arr: T[], n = 10): T[] =>
    [...arr]
      .sort((a, b) => b.score - a.score)
      .slice(0, n)
      .map((row, i) => ({ ...row, rank: i + 1 }));

  const stillPlaying = <T extends { gameState: string }>(arr: T[], min = 8): T[] => {
    const preview = arr.filter((p) => p.gameState === "Preview");
    if (preview.length >= min) return preview;
    const open = arr.filter((p) => p.gameState !== "Final");
    return open.length >= min ? open : arr;
  };

  const hrPool = stillPlaying(hr);
  const topHr = [...hrPool]
    .sort((a, b) => b.hrPct - a.hrPct || b.score - a.score)
    .slice(0, 10)
    .map((row, i) => ({ ...row, rank: i + 1 }));

  const kPool = stillPlaying(
    kPicks.filter((p) => !p.pitcher.opener),
    4,
  );

  const result: AnalysisResult = {
    date,
    generatedAt: new Date().toISOString(),
    briefing: null,
    games: games.map(({ lat: _lat, lon: _lon, ...g }) => g),
    picks: {
      hr: topHr,
      hits: topN(stillPlaying(hits)),
      tb: topN(stillPlaying(tb)),
      rbi: topN(stillPlaying(rbi)),
      sb: topN(stillPlaying(sb.filter((p) => p.season.sb >= 4), 6)),
      k: topN(kPool),
    },
    sources: [
      "MLB Stats API schedule and posted lineups, season hitting/pitching, last 10, last 6 days, vl/vr and home/away splits, team OBP",
      "RotoWire expected/confirmed batting orders, umpires, and park weather (MLB lineup wins once posted)",
      "PrizePicks MLB projections (partner board: HR, hits, TB, RBI, SB, pitcher Ks, Hits+Runs+RBIs, runs, fantasy score)",
      "Baseball Savant expected stats, Statcast barrels, pitch arsenals, batted-ball, sprint speed, pitcher running game, catcher pop",
      "Internal park factors for HR, hits, strikeouts, and steals — mix-weighted barrels vs the starter's full arsenal",
    ],
    model: {
      name: "Blast Radius desk",
      version: "2.0",
      notes: [
        "Saturday 9/12 graded 9/11 on counting slips; the HR board went 0/10. 0.5 HR is a lottery — COLD and ace matchups are docked off the top.",
        "Short starters (under ~4.3 IP) boost counting. 1.5 juice needs score 58, slot 1–6, and a real PA sample. Pederson-type thin bats are off juice.",
        "Core 3 is H+R+RBI / fantasy score / runs. Power 2 leads with Ks. HR / hits / TB overs vs aces stay off. Live day games leave the evening card.",
      ],
    },
    saberBoard: [],
    arsenals: [],
    edges: [],
    slips: [],
    lineCount: prizePicks.length,
    grade: null,
  };

  const seen = new Set<number>();
  const saberBoard: SaberRow[] = [];
  for (const pick of hr) {
    if (!pick.saber || seen.has(pick.playerId)) continue;
    seen.add(pick.playerId);
    saberBoard.push({
      playerId: pick.playerId,
      name: pick.name,
      teamAbbr: pick.teamAbbr,
      opponentAbbr: pick.opponentAbbr,
      gamePk: pick.gamePk,
      slg: pick.season.slg,
      avg: pick.season.avg,
      iso: pick.season.iso,
      hr: pick.season.hr,
      pa: pick.season.pa,
      hrScore: pick.score,
      venueName: pick.venueName,
      pitcherName: pick.pitcherName,
      saber: pick.saber,
      vsPitches: pick.vsPitches,
      matchup: pick.matchup,
      edge: pick.edge,
    });
  }
  saberBoard.sort((a, b) => (b.saber.barrelPa ?? 0) - (a.saber.barrelPa ?? 0));
  result.saberBoard = saberBoard.slice(0, 24);

  const seenPitchers = new Set<number>();
  const arsenals: ArsenalCard[] = [];
  for (const game of games) {
    for (const side of [
      { team: game.away, opp: game.home },
      { team: game.home, opp: game.away },
    ]) {
      const p = side.team.probable;
      if (!p || seenPitchers.has(p.id)) continue;
      seenPitchers.add(p.id);
      arsenals.push({
        playerId: p.id,
        name: p.name,
        teamAbbr: side.team.abbr,
        opponentAbbr: side.opp.abbr,
        gamePk: game.gamePk,
        venueName: game.venueName,
        pitcher: p,
      });
    }
  }
  result.arsenals = arsenals;
  result.edges = buildEdgesBoard({ hr, hits, tb, rbi, sb, k: kPicks });
  const complete = games.length > 0 && games.every((g) => g.abstractState === "Final");
  const graded = gradeSlips(buildSlips([...hr, ...hits, ...tb, ...rbi, ...sb, ...hrrbi, ...runs, ...fs], kPicks, date), actuals, { complete });
  result.slips = graded.slips;
  result.grade = graded.grade;

  await deskNotes(result);
  return result;
}

export async function gradePublishedCards(cards: { date: string; slips: SlipCard[] }[]): Promise<GradedPublished[]> {
  const unique = [...new Set(cards.map((c) => c.date))];
  const byDate = new Map<string, { actuals: Map<number, BoxActual>; games: GameCard[] }>();
  await Promise.all(
    unique.map(async (date) => {
      try {
        const slate = await fetchSlate(date);
        const stamp = slate.games.map((g) => `${g.gamePk}:${g.abstractState}`).join(",");
        const ttl = slate.games.length && slate.games.every((g) => g.abstractState === "Final") ? 20 * 60_000 : 90_000;
        const actuals = await cached(`box:${date}:v2:${stamp}`, ttl, () => boxActuals(slate.games));
        byDate.set(date, { actuals, games: slate.games });
      } catch {
        byDate.set(date, { actuals: new Map(), games: [] });
      }
    }),
  );
  return cards.map((card) => {
    const box = byDate.get(card.date);
    const games = box?.games ?? [];
    const finals = games.filter((g) => g.abstractState === "Final").length;
    const live = games.filter((g) => g.abstractState === "Live").length;
    const complete = games.length > 0 && finals === games.length;
    const graded = gradeSlips(card.slips, box?.actuals ?? new Map(), { complete });
    return {
      date: card.date,
      slips: graded.slips,
      grade: graded.grade,
      complete,
      live,
      finals,
      games: games.length,
    };
  });
}
