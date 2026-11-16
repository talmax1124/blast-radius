import { normName, parseStatus, type Status } from "./roster.ts";

/**
 * NHL live inputs: ESPN's scoreboard (games, DraftKings game lines, probable goalies), ESPN's core odds feed
 * (DraftKings player props), ESPN injuries, and the NHL's own public APIs (api-web.nhle.com for box scores,
 * schedules and game logs; api.nhle.com/stats for per-game blocked shots, which the game logs leave out).
 * All free, no keys.
 *
 * Fail-soft like feeds.ts: the primary source of each function throws when it is down (the caller says
 * what it could not check), and every secondary source degrades to null fields. Pass a `notes` array to
 * collect a line for each secondary source that failed.
 *
 * Team abbreviations are ESPN scoreboard style everywhere (LA, NJ, SJ, TB, UTA); `toNhlAbbr` maps to the
 * NHL API's (LAK, NJD, SJS, TBL). ESPN athlete ids (props, injuries, box scores) and NHL player ids (game
 * logs) are different number spaces: join them on `normName(name)` plus team.
 */

const SITE = "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl";
const CORE = "https://sports.core.api.espn.com/v2/sports/hockey/leagues/nhl";
const NHLE = "https://api-web.nhle.com/v1";
const NHL_STATS = "https://api.nhle.com/stats/rest/en";

async function json(url: string): Promise<any> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} from ${url}`);
  return res.json();
}

async function soft<T>(what: string, p: () => Promise<T>, fallback: T, notes?: string[]): Promise<T> {
  try {
    return await p();
  } catch (e) {
    notes?.push(`${what}: ${(e as Error).message}`);
    return fallback;
  }
}

// ---------------------------------------------------------------------------------------------------------
// Pure helpers (unit tested)
// ---------------------------------------------------------------------------------------------------------

const ESPN_TO_NHL: Record<string, string> = { LA: "LAK", NJ: "NJD", SJ: "SJS", TB: "TBL", UTAH: "UTA" };
const NHL_TO_ESPN: Record<string, string> = { LAK: "LA", NJD: "NJ", SJS: "SJ", TBL: "TB", UTAH: "UTA" };

/** Any team abbreviation (ESPN or NHL style) to ESPN scoreboard style. */
export function toEspnAbbr(abbr: string): string {
  const a = abbr.toUpperCase();
  return NHL_TO_ESPN[a] ?? a;
}

/** Any team abbreviation (ESPN or NHL style) to the NHL API's. */
export function toNhlAbbr(abbr: string): string {
  const a = toEspnAbbr(abbr);
  return ESPN_TO_NHL[a] ?? a;
}

/** ESPN's NHL season id is the year the season ends: 2027 for 2026-27 (verified on the scoreboard). */
export function espnSeason(at: Date = new Date()): number {
  return at.getUTCMonth() >= 7 ? at.getUTCFullYear() + 1 : at.getUTCFullYear();
}

/** NHL API season id, e.g. 20262027. */
export function nhlSeasonId(at: Date = new Date()): number {
  const end = espnSeason(at);
  return (end - 1) * 10000 + end;
}

/** "-115", "+125", "EVEN", 114 → number; anything else (OFF, "", 0) → null. */
export function parseAmerican(v: unknown): number | null {
  if (v == null) return null;
  const s = String(v).trim().toUpperCase();
  if (s === "EVEN" || s === "EV") return 100;
  const n = Number(s.replace(/^\+/, ""));
  return Number.isFinite(n) && n !== 0 ? n : null;
}

/** Implied probability of an American price, with the vig still in. */
export function impliedProb(american: number): number {
  return american < 0 ? -american / (-american + 100) : 100 / (american + 100);
}

/** "18:37" → 18.6167 minutes. */
export function toiMinutes(v: unknown): number {
  const m = /^(\d+):(\d{1,2})$/.exec(String(v ?? "").trim());
  return m ? Number(m[1]) + Number(m[2]) / 60 : 0;
}

/** Calendar date (YYYYMMDD) of an instant in US Eastern time, which is how both ESPN and the NHL date games. */
export function easternDate(iso: string): string {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
  return f.format(new Date(iso)).replace(/-/g, "");
}

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/^[ou+]/i, ""));
  return Number.isFinite(n) ? n : null;
};

export type NhlLineSet = {
  awayMl: number | null;
  homeMl: number | null;
  /** Home puck line, e.g. +1.5 when the home side is the dog. The away line is its negative. */
  homeSpread: number | null;
  homeSpreadPrice: number | null;
  awaySpreadPrice: number | null;
  total: number | null;
  overPrice: number | null;
  underPrice: number | null;
};

export type NhlGameOdds = NhlLineSet & { provider: string; open: NhlLineSet | null };

/** Game lines as the site scoreboard carries them for games not yet played (`competition.odds[0]`). */
export function parseScoreboardOdds(o: any): NhlGameOdds | null {
  if (!o?.moneyline && !o?.total && o?.overUnder == null) return null;
  const side = (when: "close" | "open"): NhlLineSet => ({
    awayMl: parseAmerican(o.moneyline?.away?.[when]?.odds),
    homeMl: parseAmerican(o.moneyline?.home?.[when]?.odds),
    homeSpread: num(o.pointSpread?.home?.[when]?.line),
    homeSpreadPrice: parseAmerican(o.pointSpread?.home?.[when]?.odds),
    awaySpreadPrice: parseAmerican(o.pointSpread?.away?.[when]?.odds),
    total: num(o.total?.over?.[when]?.line) ?? (when === "close" ? num(o.overUnder) : null),
    overPrice: parseAmerican(o.total?.over?.[when]?.odds),
    underPrice: parseAmerican(o.total?.under?.[when]?.odds),
  });
  return { provider: o.provider?.name ?? "", ...side("close"), open: o.moneyline?.away?.open ? side("open") : null };
}

/**
 * Game lines from the core odds feed (`competitions/{id}/odds` items). This is the one that keeps the
 * closing numbers for finished games, which the scoreboard drops.
 */
export function parseCoreOdds(it: any): NhlGameOdds | null {
  if (!it) return null;
  const a = it.awayTeamOdds ?? {};
  const h = it.homeTeamOdds ?? {};
  const side = (when: "close" | "open" | "current"): NhlLineSet => ({
    awayMl: parseAmerican(a[when]?.moneyLine?.american),
    homeMl: parseAmerican(h[when]?.moneyLine?.american),
    homeSpread: num(h[when]?.pointSpread?.american),
    homeSpreadPrice: parseAmerican(h[when]?.spread?.american),
    awaySpreadPrice: parseAmerican(a[when]?.spread?.american),
    total: num(it[when]?.total?.american),
    overPrice: parseAmerican(it[when]?.over?.american),
    underPrice: parseAmerican(it[when]?.under?.american),
  });
  const close = a.close ? side("close") : a.current ? side("current") : null;
  const flat: NhlLineSet = {
    awayMl: parseAmerican(a.moneyLine), homeMl: parseAmerican(h.moneyLine),
    homeSpread: num(it.spread), homeSpreadPrice: parseAmerican(h.spreadOdds), awaySpreadPrice: parseAmerican(a.spreadOdds),
    total: num(it.overUnder), overPrice: parseAmerican(it.overOdds), underPrice: parseAmerican(it.underOdds),
  };
  const best: NhlLineSet = close
    ? (Object.fromEntries(Object.entries(close).map(([k, v]) => [k, v ?? flat[k as keyof NhlLineSet]])) as NhlLineSet)
    : flat;
  return { provider: it.provider?.name ?? "", ...best, open: a.open ? side("open") : null };
}

export type NhlStat = "sog" | "points" | "goals" | "assists" | "saves" | "blocks" | "ppp";

/** DraftKings market names in ESPN's NHL prop feed (seen Oct-Nov 2026), mapped to stats. */
export const NHL_MAIN_MARKETS: Record<string, NhlStat> = {
  "Total Shots on Goal": "sog",
  "Total Points": "points",
  "Total Assists": "assists",
  "Total Saves": "saves",
  "Total Blocked Shots": "blocks",
  "Total Goals": "goals", // not seen yet; goals come as the yes-only markets below
};
export const NHL_MILESTONE_MARKETS: Record<string, NhlStat> = {
  "Shots on Goal Milestones": "sog",
  "Points Milestones": "points",
  "Goals Milestones": "goals",
  "Assists Milestones": "assists",
  "Goalkeeper Saves Milestones": "saves",
  "Blocked Shots Milestones": "blocks",
  "Powerplay Points Milestones": "ppp",
};
/** Yes-only goal markets: threshold N means "N or more". Same prices as Goals Milestones where both exist. */
export const NHL_LADDER_MARKETS: Record<string, [NhlStat, number]> = {
  "Anytime Goalscorer": ["goals", 1],
  "To Score 2+ Goals": ["goals", 2],
  "To Score 3+ Goals": ["goals", 3],
};

export type NhlPropRow = {
  espnId: string;
  stat: NhlStat;
  /** Over/under line; for an alt (N+) market this is N - 0.5. */
  line: number;
  over: number | null;
  /** Null on alt markets, which are yes-only. */
  under: number | null;
  openLine: number | null;
  openOver: number | null;
  openUnder: number | null;
  /** True for milestone / N+ / anytime markets (yes-only ladder rungs), false for the main two-way line. */
  alt: boolean;
  market: string;
  /** Latest `lastUpdated` of the feed items behind this row (ISO). On finished games some stamps fall after
   * puck drop, but the values match pregame lines (not live ones). Use it to spot stale lines. */
  updated: string | null;
};

const athleteId = (it: any): string | null => /athletes\/(\d+)/.exec(it?.athlete?.$ref ?? "")?.[1] ?? null;

/**
 * Player lines from raw prop items. Main two-way lines arrive as two items with the same line, over first
 * then under (checked against the milestone rung at the same threshold, which DraftKings prices like the
 * over); when that rung disagrees, the pair is flipped. A main line with one item keeps its line, no prices.
 */
export function parsePropItems(items: any[]): NhlPropRow[] {
  const main = new Map<string, { espnId: string; stat: NhlStat; line: number; market: string; items: any[] }>();
  const alts = new Map<string, NhlPropRow>();
  const addAlt = (espnId: string, stat: NhlStat, n: number, price: number | null, market: string, updated: string | null) => {
    const k = `${espnId}|${stat}|${n}`;
    if (price == null || alts.has(k)) return;
    alts.set(k, { espnId, stat, line: n - 0.5, over: price, under: null, openLine: null, openOver: null, openUnder: null, alt: true, market, updated });
  };
  const ladders: any[] = [];
  for (const it of items ?? []) {
    const name = it?.type?.name ?? "";
    const id = athleteId(it);
    if (!id) continue;
    const price = parseAmerican(it.odds?.american?.value);
    if (NHL_MAIN_MARKETS[name]) {
      const line = num(it.current?.target?.value ?? it.odds?.total?.value);
      if (line == null) continue;
      const k = `${id}|${NHL_MAIN_MARKETS[name]}|${line}`;
      if (!main.has(k)) main.set(k, { espnId: id, stat: NHL_MAIN_MARKETS[name], line, market: name, items: [] });
      main.get(k)!.items.push(it);
    } else if (NHL_MILESTONE_MARKETS[name]) {
      const n = num(it.current?.target?.value) ?? num(String(it.odds?.total?.value ?? "").replace("+", ""));
      if (n != null) addAlt(id, NHL_MILESTONE_MARKETS[name], n, price, name, it.lastUpdated ?? null);
    } else if (NHL_LADDER_MARKETS[name]) {
      ladders.push(it);
    }
  }
  for (const it of ladders) {
    const [stat, n] = NHL_LADDER_MARKETS[it.type.name];
    addAlt(athleteId(it)!, stat, n, parseAmerican(it.odds?.american?.value), it.type.name, it.lastUpdated ?? null);
  }
  const out: NhlPropRow[] = [];
  for (const m of main.values()) {
    const prices = m.items.map((x) => parseAmerican(x.odds?.american?.value));
    const opens = m.items.map((x) => parseAmerican(x.odds?.american?.open));
    let [over, under] = m.items.length === 2 ? prices : [null, null];
    let [openOver, openUnder] = m.items.length === 2 ? opens : [null, null];
    const rung = alts.get(`${m.espnId}|${m.stat}|${m.line + 0.5}`)?.over;
    if (rung != null && over != null && under != null) {
      const p = impliedProb(rung);
      if (Math.abs(impliedProb(under) - p) < Math.abs(impliedProb(over) - p)) {
        [over, under] = [under, over];
        [openOver, openUnder] = [openUnder, openOver];
      }
    }
    out.push({
      espnId: m.espnId, stat: m.stat, line: m.line, over, under,
      openLine: num(m.items[0].open?.target?.value), openOver, openUnder, alt: false, market: m.market,
      updated: m.items.map((x) => x.lastUpdated as string | undefined).filter(Boolean).sort().pop() ?? null,
    });
  }
  return [...out, ...alts.values()];
}

/** Stats by key from one ESPN box-score group (`keys` + `stats` arrays). */
export function boxStats(keys: string[], stats: string[]): Record<string, string> {
  const o: Record<string, string> = {};
  keys.forEach((k, i) => (o[k] = stats?.[i] ?? ""));
  return o;
}

// ---------------------------------------------------------------------------------------------------------
// ESPN plumbing
// ---------------------------------------------------------------------------------------------------------

/** ESPN team id → scoreboard abbreviation and name. */
async function espnTeamIds(): Promise<Map<string, { abbr: string; name: string }>> {
  const d = await json(`${SITE}/teams`);
  const out = new Map<string, { abbr: string; name: string }>();
  for (const t of d.sports[0].leagues[0].teams) out.set(String(t.team.id), { abbr: toEspnAbbr(t.team.abbreviation), name: t.team.displayName });
  return out;
}

type EspnPerson = { name: string; team: string; pos: string };

/** ESPN athlete id → name, team, position for one team's current roster. */
async function espnRoster(teamId: string, abbr: string): Promise<Map<string, EspnPerson>> {
  const d = await json(`${SITE}/teams/${teamId}/roster`);
  const out = new Map<string, EspnPerson>();
  for (const g of d.athletes ?? []) {
    for (const a of g.items ?? [g]) out.set(String(a.id), { name: a.displayName, team: abbr, pos: a.position?.abbreviation ?? "" });
  }
  return out;
}

/** Teams in one event from the core feed: [{ id, abbr, homeAway, probables }]. */
async function eventTeams(eventId: string): Promise<{ date: string; teams: { id: string; abbr: string; homeAway: string }[] }> {
  const [c, ids] = await Promise.all([json(`${CORE}/events/${eventId}/competitions/${eventId}`), espnTeamIds()]);
  return {
    date: c.date,
    teams: (c.competitors ?? []).map((x: any) => ({ id: String(x.id), abbr: ids.get(String(x.id))?.abbr ?? "", homeAway: x.homeAway })),
  };
}

// ---------------------------------------------------------------------------------------------------------
// Slate
// ---------------------------------------------------------------------------------------------------------

export type NhlProbable = { team: string; name: string; espnId: string; status: "confirmed" | "expected" | "unknown" };

export type NhlGame = {
  eventId: string;
  /** NHL API game id (e.g. 2026020331), matched by date and teams; null if the NHL schedule was down. */
  nhlGameId: number | null;
  start: string;
  away: string;
  home: string;
  awayName: string;
  homeName: string;
  state: "pre" | "in" | "post";
  status: string;
  awayScore: number | null;
  homeScore: number | null;
  /** DraftKings game lines: the scoreboard's for upcoming games, the core feed's closing lines for finished ones. */
  odds: NhlGameOdds | null;
  /** ESPN probable starting goalies ("expected" before the morning skate, "confirmed" once named). */
  probables: NhlProbable[];
};

function probableStatus(s: any): NhlProbable["status"] {
  const t = String(s?.type ?? s?.name ?? "").toLowerCase();
  return t.includes("confirm") ? "confirmed" : t.includes("expect") || t.includes("probable") ? "expected" : "unknown";
}

/** NHL API game ids for one Eastern date, keyed "AWAY@HOME" in ESPN abbreviations. */
async function nhlGameIds(date: string): Promise<Map<string, number>> {
  const d = await json(`${NHLE}/score/${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`);
  const out = new Map<string, number>();
  for (const g of d.games ?? []) out.set(`${toEspnAbbr(g.awayTeam.abbrev)}@${toEspnAbbr(g.homeTeam.abbrev)}`, g.id);
  return out;
}

/** Games on one date (YYYYMMDD, US Eastern) with DraftKings lines and probable goalies. */
export async function nhlSlate(date: string, notes?: string[]): Promise<NhlGame[]> {
  const [d, ids] = await Promise.all([
    json(`${SITE}/scoreboard?dates=${date}`),
    soft("NHL schedule", () => nhlGameIds(date), new Map<string, number>(), notes),
  ]);
  const games: NhlGame[] = [];
  for (const e of d.events ?? []) {
    const c = e.competitions?.[0] ?? {};
    const side = (ha: string) => c.competitors?.find((x: any) => x.homeAway === ha) ?? {};
    const a = side("away");
    const h = side("home");
    const away = toEspnAbbr(a.team?.abbreviation ?? "");
    const home = toEspnAbbr(h.team?.abbreviation ?? "");
    const probables: NhlProbable[] = [];
    for (const t of [a, h]) {
      for (const p of t.probables ?? []) {
        if (p.name !== "probableStartingGoalie") continue;
        probables.push({ team: toEspnAbbr(t.team?.abbreviation ?? ""), name: p.athlete?.displayName ?? "", espnId: String(p.playerId ?? p.athlete?.id ?? ""), status: probableStatus(p.status) });
      }
    }
    const state = (c.status?.type?.state ?? "pre") as NhlGame["state"];
    games.push({
      eventId: String(e.id), nhlGameId: ids.get(`${away}@${home}`) ?? null, start: e.date, away, home,
      awayName: a.team?.displayName ?? "", homeName: h.team?.displayName ?? "", state, status: c.status?.type?.name ?? "",
      awayScore: state === "pre" ? null : num(a.score), homeScore: state === "pre" ? null : num(h.score),
      odds: parseScoreboardOdds((c.odds ?? []).find((o: any) => o.provider?.id === "100") ?? c.odds?.[0]),
      probables,
    });
  }
  await Promise.all(games.filter((g) => !g.odds).map(async (g) => {
    g.odds = await soft(`core odds ${g.eventId}`, async () => {
      const o = await json(`${CORE}/events/${g.eventId}/competitions/${g.eventId}/odds`);
      return parseCoreOdds((o.items ?? []).find((x: any) => String(x.provider?.id) === "100") ?? o.items?.[0]);
    }, null, notes);
  }));
  return games;
}

// ---------------------------------------------------------------------------------------------------------
// Player props
// ---------------------------------------------------------------------------------------------------------

export type NhlPropLine = NhlPropRow & { name: string; team: string; pos: string };

/** Raw items of ESPN's DraftKings prop feed for one event (all pages). Served for finished games too. */
export async function nhlPropItems(eventId: string): Promise<any[]> {
  const items: any[] = [];
  for (let page = 1; ; page++) {
    const d = await json(`${CORE}/events/${eventId}/competitions/${eventId}/odds/100/propBets?limit=500&page=${page}`);
    items.push(...(d.items ?? []));
    if (page >= (d.pageCount ?? 1)) break;
  }
  return items;
}

/**
 * DraftKings player lines for one event: main two-way lines (sog, points, assists, blocks, saves) with over
 * and under prices, plus yes-only ladder rungs flagged `alt` (milestones N+, anytime goal, 2+ goals, power-play
 * points). Saves and blocks are usually posted only on game day, saves only for the goalie the book expects.
 */
export async function nhlBookLines(eventId: string, notes?: string[]): Promise<NhlPropLine[]> {
  const [items, ev] = await Promise.all([nhlPropItems(eventId), soft("event teams", () => eventTeams(eventId), { date: "", teams: [] }, notes)]);
  const rows = parsePropItems(items);
  const people = new Map<string, EspnPerson>();
  await Promise.all(ev.teams.map(async (t) => {
    const r = await soft(`roster ${t.abbr}`, () => espnRoster(t.id, t.abbr), new Map<string, EspnPerson>(), notes);
    for (const [k, v] of r) people.set(k, v);
  }));
  const season = ev.date ? espnSeason(new Date(ev.date)) : espnSeason();
  const ids = await soft("team ids", espnTeamIds, new Map<string, { abbr: string; name: string }>(), notes);
  await Promise.all([...new Set(rows.map((r) => r.espnId))].filter((id) => !people.has(id)).map(async (id) => {
    try {
      const a = await json(`${CORE}/seasons/${season}/athletes/${id}`);
      const tid = /teams\/(\d+)/.exec(a.team?.$ref ?? "")?.[1] ?? "";
      people.set(id, { name: a.displayName, team: ids.get(tid)?.abbr ?? "", pos: a.position?.abbreviation ?? "" });
    } catch {
      notes?.push(`athlete ${id}: name not found, lines dropped`);
    }
  }));
  return rows.filter((r) => people.has(r.espnId)).map((r) => ({ ...r, ...people.get(r.espnId)! }));
}

// ---------------------------------------------------------------------------------------------------------
// Goalies
// ---------------------------------------------------------------------------------------------------------

export type NhlGoalie = {
  eventId: string;
  team: string;
  /** ESPN's probable starter (scoreboard `probables`), or the book's saves goalie when ESPN names none. */
  name: string;
  espnId: string;
  /** confirmed: ESPN marked the starter confirmed, or the game has started and the NHL box score names him. */
  status: "confirmed" | "expected" | "unknown";
  /**
   * Goalies DraftKings has a main saves line on for this team, freshest first. The book posts saves for the
   * goalie it expects to start, but can leave a stale line up after a switch (VAN Nov 15: Lankinen and
   * Merilainen both posted, Merilainen started).
   */
  book: { name: string; line: number; over: number | null; under: number | null; updated: string | null }[];
  /** More than one saves goalie posted, the book's goalie is not ESPN's probable, or someone else started. */
  conflict: boolean;
  /** Actual starter from the NHL box score (`starter: true`) once the game is live or final, else null. */
  started: string | null;
};

/** Starting goalie per team in the NHL box score, by ESPN team abbreviation. Full names from the roster spots. */
async function nhlStarters(nhlGameId: number): Promise<Map<string, string>> {
  const [b, pbp] = await Promise.all([json(`${NHLE}/gamecenter/${nhlGameId}/boxscore`), json(`${NHLE}/gamecenter/${nhlGameId}/play-by-play`).catch(() => null)]);
  const full = new Map<number, string>();
  for (const r of pbp?.rosterSpots ?? []) full.set(r.playerId, `${r.firstName?.default ?? ""} ${r.lastName?.default ?? ""}`.trim());
  const out = new Map<string, string>();
  for (const [side, team] of [["awayTeam", b.awayTeam?.abbrev], ["homeTeam", b.homeTeam?.abbrev]] as const) {
    const g = (b.playerByGameStats?.[side]?.goalies ?? []).find((x: any) => x.starter);
    if (g) out.set(toEspnAbbr(team ?? ""), full.get(g.playerId) ?? g.name?.default ?? "");
  }
  return out;
}

/**
 * Starting goalies for a date (YYYYMMDD) or one ESPN event id. Three sources, cross-checked:
 * ESPN scoreboard probables (Expected / Confirmed), DraftKings' saves lines, and the NHL box score once
 * the puck drops. The NHL API's pregame landing only lists each team's goalies (no starter flag).
 */
export async function nhlGoalies(dateOrEvent: string, notes?: string[]): Promise<NhlGoalie[]> {
  let games: NhlGame[];
  if (/^\d{8}$/.test(dateOrEvent)) games = await nhlSlate(dateOrEvent, notes);
  else {
    const ev = await eventTeams(dateOrEvent);
    games = (await nhlSlate(easternDate(ev.date), notes)).filter((g) => g.eventId === dateOrEvent);
  }
  const out: NhlGoalie[] = [];
  await Promise.all(games.map(async (g) => {
    const lines = await soft(`saves lines ${g.eventId}`, () => nhlBookLines(g.eventId, notes), [] as NhlPropLine[], notes);
    const starters = g.state !== "pre" && g.nhlGameId
      ? await soft(`NHL box score ${g.nhlGameId}`, () => nhlStarters(g.nhlGameId!), new Map<string, string>(), notes)
      : new Map<string, string>();
    for (const team of [g.away, g.home]) {
      const p = g.probables.find((x) => x.team === team);
      const saves = lines.filter((l) => l.stat === "saves" && !l.alt && l.team === team).sort((a, b) => (b.updated ?? "").localeCompare(a.updated ?? ""));
      const book = saves.map((l) => ({ name: l.name, line: l.line, over: l.over, under: l.under, updated: l.updated }));
      const started = starters.get(team) ?? null;
      const name = p?.name ?? book[0]?.name ?? started ?? "";
      out.push({
        eventId: g.eventId, team, name, espnId: p?.espnId ?? saves[0]?.espnId ?? "",
        status: started && normName(started) === normName(name) ? "confirmed" : p?.status ?? (book.length ? "expected" : "unknown"),
        book, started,
        conflict: book.length > 1 || !!(book.length && p && normName(book[0].name) !== normName(p.name)) || !!(started && normName(started) !== normName(name)),
      });
    }
  }));
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// Game logs
// ---------------------------------------------------------------------------------------------------------

export type NhlLogGame = {
  gameId: number;
  date: string;
  team: string;
  opp: string;
  home: boolean;
  /** Minutes. */
  toi: number;
  shots: number;
  goals: number;
  assists: number;
  points: number;
  blocks: number | null;
  hits: number | null;
  ppPoints: number | null;
  /** Goalies only. */
  started?: boolean;
  shotsAgainst?: number;
  saves?: number;
  goalsAgainst?: number;
};

export type NhlAverages = {
  gp: number;
  toi: number;
  shots: number;
  goals: number;
  assists: number;
  points: number;
  blocks: number | null;
  /** Goalies: starts, and shots against / saves / goals against per start. */
  starts?: number;
  shotsAgainst?: number;
  saves?: number;
  goalsAgainst?: number;
};

export type NhlPlayerLog = {
  /** NHL API player id (not ESPN's). */
  playerId: number;
  name: string;
  team: string;
  pos: string;
  /** Most recent first. */
  games: NhlLogGame[];
  /** Per-game averages over `games`. */
  recent: NhlAverages;
  /** Per-game averages over the whole regular season to date. */
  season: NhlAverages;
};

export function averages(games: NhlLogGame[], goalie: boolean): NhlAverages {
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const blocks = games.filter((g) => g.blocks != null).map((g) => g.blocks!);
  const out: NhlAverages = {
    gp: games.length, toi: avg(games.map((g) => g.toi)), shots: avg(games.map((g) => g.shots)), goals: avg(games.map((g) => g.goals)),
    assists: avg(games.map((g) => g.assists)), points: avg(games.map((g) => g.points)), blocks: blocks.length ? avg(blocks) : null,
  };
  if (goalie) {
    const st = games.filter((g) => g.started);
    out.starts = st.length;
    out.shotsAgainst = avg(st.map((g) => g.shotsAgainst ?? 0));
    out.saves = avg(st.map((g) => g.saves ?? 0));
    out.goalsAgainst = avg(st.map((g) => g.goalsAgainst ?? 0));
  }
  return out;
}

/** Per-game blocked shots / hits for skaters from the NHL stats API (the game logs omit them). */
async function realtimeByGame(cayenne: string): Promise<Map<string, { blocks: number; hits: number }>> {
  const d = await json(`${NHL_STATS}/skater/realtime?isAggregate=false&isGame=true&limit=-1&cayenneExp=${encodeURIComponent(cayenne)}`);
  const out = new Map<string, { blocks: number; hits: number }>();
  for (const r of d.data ?? []) out.set(`${r.playerId}|${r.gameId}`, { blocks: r.blockedShots ?? 0, hits: r.hits ?? 0 });
  return out;
}

/** Saves from a goalie game-log row: SA x SV% (SA - GA overcounts goals that were not shots, e.g. own goals). */
function savesOf(g: any): number {
  const sa = g.shotsAgainst ?? 0;
  return g.savePctg != null ? Math.round(sa * g.savePctg) : Math.max(0, sa - (g.goalsAgainst ?? 0));
}

async function playerLog(playerId: number, n: number, notes?: string[]): Promise<NhlPlayerLog> {
  const [log, landing] = await Promise.all([json(`${NHLE}/player/${playerId}/game-log/now`), json(`${NHLE}/player/${playerId}/landing`)]);
  const pos = String(landing.position ?? "");
  const goalie = pos === "G";
  const rt = goalie ? new Map<string, { blocks: number; hits: number }>() : await soft(
    "NHL stats blocks", () => realtimeByGame(`playerId=${playerId} and seasonId=${log.seasonId ?? nhlSeasonId()} and gameTypeId=2`),
    new Map<string, { blocks: number; hits: number }>(), notes,
  );
  const games: NhlLogGame[] = (log.gameLog ?? []).map((g: any) => {
    const r = rt.get(`${playerId}|${g.gameId}`);
    const row: NhlLogGame = {
      gameId: g.gameId, date: g.gameDate, team: toEspnAbbr(g.teamAbbrev ?? ""), opp: toEspnAbbr(g.opponentAbbrev ?? ""), home: g.homeRoadFlag === "H",
      toi: toiMinutes(g.toi), shots: g.shots ?? 0, goals: g.goals ?? 0, assists: g.assists ?? 0, points: g.points ?? 0,
      blocks: goalie ? null : r?.blocks ?? null, hits: goalie ? null : r?.hits ?? null, ppPoints: g.powerPlayPoints ?? null,
    };
    if (goalie) Object.assign(row, { started: (g.gamesStarted ?? 0) > 0, shotsAgainst: g.shotsAgainst ?? 0, goalsAgainst: g.goalsAgainst ?? 0, saves: savesOf(g) });
    return row;
  });
  return {
    playerId, name: `${landing.firstName?.default ?? ""} ${landing.lastName?.default ?? ""}`.trim(), team: toEspnAbbr(landing.currentTeamAbbrev ?? ""), pos,
    games: games.slice(0, n), recent: averages(games.slice(0, n), goalie), season: averages(games, goalie),
  };
}

async function teamLogs(team: string, n: number, notes?: string[]): Promise<NhlPlayerLog[]> {
  const nhl = toNhlAbbr(team);
  const espn = toEspnAbbr(team);
  const [sched, roster, club, rtSeason] = await Promise.all([
    json(`${NHLE}/club-schedule-season/${nhl}/now`),
    soft(`NHL roster ${nhl}`, () => json(`${NHLE}/roster/${nhl}/current`), null, notes),
    soft(`NHL club stats ${nhl}`, () => json(`${NHLE}/club-stats/${nhl}/now`), null, notes),
    soft(`NHL stats season blocks ${nhl}`, () => json(`${NHL_STATS}/skater/realtime?isAggregate=false&isGame=false&limit=-1&cayenneExp=${encodeURIComponent(`seasonId=${nhlSeasonId()} and gameTypeId=2 and teamAbbrev="${nhl}"`)}`), null, notes),
  ]);
  const done = (sched.games ?? []).filter((g: any) => g.gameType === 2 && (g.gameState === "OFF" || g.gameState === "FINAL")).slice(-n).reverse();
  const names = new Map<number, { name: string; pos: string }>();
  for (const grp of ["forwards", "defensemen", "goalies"]) {
    for (const p of roster?.[grp] ?? []) names.set(p.id, { name: `${p.firstName?.default ?? ""} ${p.lastName?.default ?? ""}`.trim(), pos: p.positionCode ?? "" });
  }
  const rt = await soft("NHL stats blocks", () => realtimeByGame(`seasonId=${nhlSeasonId()} and gameTypeId=2 and teamAbbrev="${nhl}"`), new Map<string, { blocks: number; hits: number }>(), notes);
  const byPlayer = new Map<number, { name: string; pos: string; games: NhlLogGame[] }>();
  const boxes = await Promise.all(done.map((g: any) => soft(`NHL box score ${g.id}`, () => json(`${NHLE}/gamecenter/${g.id}/boxscore`), null, notes)));
  for (const b of boxes) {
    if (!b) continue;
    const home = toNhlAbbr(b.homeTeam?.abbrev ?? "") === nhl;
    const mine = b.playerByGameStats?.[home ? "homeTeam" : "awayTeam"] ?? {};
    const opp = toEspnAbbr((home ? b.awayTeam : b.homeTeam)?.abbrev ?? "");
    for (const grp of ["forwards", "defense", "goalies"]) {
      for (const p of mine[grp] ?? []) {
        const toi = toiMinutes(p.toi);
        if (toi === 0) continue;
        const goalie = grp === "goalies";
        const r = rt.get(`${p.playerId}|${b.id}`);
        const row: NhlLogGame = {
          gameId: b.id, date: b.gameDate, team: espn, opp, home, toi, shots: p.sog ?? 0, goals: p.goals ?? 0, assists: p.assists ?? 0,
          points: p.points ?? (p.goals ?? 0) + (p.assists ?? 0), blocks: goalie ? null : p.blockedShots ?? r?.blocks ?? null, hits: goalie ? null : p.hits ?? r?.hits ?? null,
          ppPoints: null,
        };
        if (goalie) Object.assign(row, { started: !!p.starter, shotsAgainst: p.shotsAgainst ?? 0, saves: p.saves ?? 0, goalsAgainst: p.goalsAgainst ?? 0 });
        if (!byPlayer.has(p.playerId)) byPlayer.set(p.playerId, { name: names.get(p.playerId)?.name ?? p.name?.default ?? "", pos: names.get(p.playerId)?.pos ?? p.position ?? "", games: [] });
        byPlayer.get(p.playerId)!.games.push(row);
      }
    }
  }
  const seasonBlocks = new Map<number, number>();
  for (const r of rtSeason?.data ?? []) if (r.gamesPlayed) seasonBlocks.set(r.playerId, (r.blockedShots ?? 0) / r.gamesPlayed);
  const seasonOf = (id: number, goalie: boolean, recent: NhlAverages): NhlAverages => {
    const s = (club?.[goalie ? "goalies" : "skaters"] ?? []).find((x: any) => x.playerId === id);
    if (!s || !s.gamesPlayed) return recent;
    const gp = s.gamesPlayed;
    if (goalie) {
      const st = s.gamesStarted || 0;
      return { gp, toi: (s.timeOnIce ?? 0) / 60 / gp, shots: 0, goals: (s.goals ?? 0) / gp, assists: (s.assists ?? 0) / gp, points: (s.points ?? 0) / gp, blocks: null,
        starts: st, shotsAgainst: st ? (s.shotsAgainst ?? 0) / st : 0, saves: st ? (s.saves ?? 0) / st : 0, goalsAgainst: st ? (s.goalsAgainst ?? 0) / st : 0 };
    }
    return { gp, toi: (s.avgTimeOnIcePerGame ?? 0) / 60, shots: (s.shots ?? 0) / gp, goals: (s.goals ?? 0) / gp, assists: (s.assists ?? 0) / gp, points: (s.points ?? 0) / gp, blocks: seasonBlocks.get(id) ?? null };
  };
  return [...byPlayer].map(([playerId, p]) => {
    const goalie = p.pos === "G";
    const recent = averages(p.games, goalie);
    return { playerId, name: p.name, team: espn, pos: p.pos, games: p.games, recent, season: seasonOf(playerId, goalie, recent) };
  });
}

/**
 * Recent game logs with season averages. A number is an NHL API player id (one player, from his game log
 * plus the NHL stats API for blocks); a string is a team abbreviation (everyone who played in the team's
 * last `n` games, from the NHL box scores, with season averages from club stats). Goalie shots against /
 * saves are averaged per start.
 */
export async function nhlPlayerLogs(target: number | string, n = 10, notes?: string[]): Promise<NhlPlayerLog[]> {
  if (typeof target === "number" || /^\d+$/.test(target)) return [await playerLog(Number(target), n, notes)];
  return teamLogs(target, n, notes);
}

// ---------------------------------------------------------------------------------------------------------
// Injuries
// ---------------------------------------------------------------------------------------------------------

export type NhlInjury = {
  team: string;
  name: string;
  espnId: string;
  /** Worst-case read across the sources that list him. */
  status: Status;
  /** ESPN's own label, e.g. "IR-LT", "Day-To-Day", "OUT". */
  label: string;
  detail: string;
  returnDate: string | null;
  /** Status in the league-wide feed / the game's own summary list (null when that source does not list him). */
  league: Status | null;
  game: Status | null;
  /** The two ESPN lists disagree, or one lists him and the other (fetched) does not. */
  conflict: boolean;
  /** DraftKings posts props on him for this event (only with an event id): a tagged-out player with lines is suspect. */
  bookPosted: boolean | null;
};

const RANK: Record<Status, number> = { active: 0, questionable: 1, doubtful: 2, out: 3 };

function injuryRow(team: string, i: any): { team: string; name: string; espnId: string; status: Status; label: string; detail: string; returnDate: string | null } {
  const label = i.details?.fantasyStatus?.abbreviation ?? i.type?.abbreviation ?? i.status ?? "";
  const detail = [i.details?.type, i.details?.detail].filter(Boolean).join(" ") || i.shortComment || "";
  const espnId = String(i.athlete?.id ?? /\/id\/(\d+)/.exec((i.athlete?.links ?? []).map((l: any) => l.href).join(" "))?.[1] ?? "");
  return { team, name: i.athlete?.displayName ?? "", espnId, status: parseStatus(i.status), label, detail, returnDate: i.details?.returnDate ?? null };
}

/**
 * Injuries for the given teams from ESPN's league feed, cross-checked against the event's own summary list
 * and DraftKings' props when an event id is given. The two ESPN lists can disagree (stale tags: we were
 * burned in the NFL), so both statuses are kept and `conflict` marks the disagreements.
 */
export async function nhlInjuries(teams: string[], eventId?: string, notes?: string[]): Promise<NhlInjury[]> {
  const want = new Set(teams.map(toEspnAbbr));
  const [ids, league] = await Promise.all([espnTeamIds(), json(`${SITE}/injuries`)]);
  const rows = new Map<string, NhlInjury>();
  const key = (team: string, name: string) => `${team}|${normName(name)}`;
  for (const t of league.injuries ?? []) {
    const abbr = ids.get(String(t.id))?.abbr ?? [...ids.values()].find((x) => x.name === t.displayName)?.abbr;
    if (!abbr || !want.has(abbr)) continue;
    for (const i of t.injuries ?? []) {
      const r = injuryRow(abbr, i);
      rows.set(key(abbr, r.name), { ...r, league: r.status, game: null, conflict: false, bookPosted: null });
    }
  }
  if (eventId) {
    const s = await soft(`game injuries ${eventId}`, () => json(`${SITE}/summary?event=${eventId}`), null, notes);
    if (s) {
      const listed = new Set<string>();
      for (const t of s.injuries ?? []) {
        const abbr = toEspnAbbr(t.team?.abbreviation ?? "");
        if (!want.has(abbr)) continue;
        for (const i of t.injuries ?? []) {
          const r = injuryRow(abbr, i);
          const k = key(abbr, r.name);
          listed.add(k);
          const prev = rows.get(k);
          if (prev) {
            prev.game = r.status;
            if (RANK[r.status] > RANK[prev.status]) Object.assign(prev, { status: r.status, label: r.label });
            prev.conflict = prev.league !== r.status;
          } else rows.set(k, { ...r, league: null, game: r.status, conflict: true, bookPosted: null });
        }
      }
      const gameTeams = new Set((s.injuries ?? []).map((t: any) => toEspnAbbr(t.team?.abbreviation ?? "")));
      for (const [k, r] of rows) if (r.game == null && gameTeams.has(r.team) && !listed.has(k)) r.conflict = true;
    }
    const items = await soft(`props ${eventId}`, () => nhlPropItems(eventId), null, notes);
    if (items) {
      const posted = new Set(items.map(athleteId).filter((x): x is string => !!x));
      for (const r of rows.values()) r.bookPosted = posted.has(r.espnId);
    }
  }
  return [...rows.values()];
}

// ---------------------------------------------------------------------------------------------------------
// Results (grading / backtests)
// ---------------------------------------------------------------------------------------------------------

export type NhlSkaterResult = {
  espnId: string; name: string; team: string; pos: "F" | "D"; toi: number;
  sog: number; goals: number; assists: number; points: number; blocks: number; hits: number; ppToi: number;
};
export type NhlGoalieResult = {
  espnId: string; name: string; team: string; started: boolean; toi: number; shotsAgainst: number; saves: number; goalsAgainst: number;
};
export type NhlResults = {
  /** detail is ESPN's "Final", "Final/OT" or "Final/SO" (shootout goals are not in player stats). */
  eventId: string; final: boolean; status: string; detail: string; away: string; home: string; awayScore: number | null; homeScore: number | null;
  skaters: NhlSkaterResult[]; goalies: NhlGoalieResult[];
};

/** Parse an ESPN NHL summary's box score into per-player results. `starters` (team → name) from the NHL box score, optional. */
export function parseResults(eventId: string, s: any, starters?: Map<string, string>): NhlResults {
  const comp = s.header?.competitions?.[0] ?? {};
  const side = (ha: string) => comp.competitors?.find((c: any) => c.homeAway === ha) ?? {};
  const skaters: NhlSkaterResult[] = [];
  const goalies: NhlGoalieResult[] = [];
  for (const t of s.boxscore?.players ?? []) {
    const team = toEspnAbbr(t.team?.abbreviation ?? "");
    const mine: NhlGoalieResult[] = [];
    for (const g of t.statistics ?? []) {
      for (const a of g.athletes ?? []) {
        const st = boxStats(g.keys ?? [], a.stats ?? []);
        const n = (k: string) => Number(st[k]) || 0;
        const base = { espnId: String(a.athlete?.id ?? ""), name: a.athlete?.displayName ?? "", team, toi: toiMinutes(st.timeOnIce) };
        if (g.name === "goalies") mine.push({ ...base, started: false, shotsAgainst: n("shotsAgainst"), saves: n("saves"), goalsAgainst: n("goalsAgainst") });
        else skaters.push({
          ...base, pos: g.name === "defenses" ? "D" : "F", sog: n("shotsTotal"), goals: n("goals"), assists: n("assists"),
          points: n("goals") + n("assists"), blocks: n("blockedShots"), hits: n("hits"), ppToi: toiMinutes(st.powerPlayTimeOnIce),
        });
      }
    }
    const named = starters?.get(team);
    const pick = (named && mine.find((x) => normName(x.name) === normName(named))) ?? [...mine].sort((a, b) => b.toi - a.toi)[0];
    if (pick && (mine.length === 1 || named || pick.toi > 0)) pick.started = true;
    goalies.push(...mine);
  }
  const state = comp.status?.type?.state;
  return {
    eventId, final: !!comp.status?.type?.completed, status: comp.status?.type?.name ?? "", detail: comp.status?.type?.detail ?? "",
    away: toEspnAbbr(side("away").team?.abbreviation ?? ""), home: toEspnAbbr(side("home").team?.abbreviation ?? ""),
    awayScore: state === "pre" ? null : num(side("away").score), homeScore: state === "pre" ? null : num(side("home").score),
    skaters, goalies,
  };
}

/**
 * Actual box-score results for one event, for grading tickets and backtests. ESPN's summary gives the stats
 * (keyed by the same ESPN athlete ids as the props); the NHL box score's `starter` flag names the starting
 * goalie when both of a team's goalies played (pulled starter). Without it, the goalie with more ice time.
 */
export async function nhlResults(eventId: string, notes?: string[]): Promise<NhlResults> {
  const s = await json(`${SITE}/summary?event=${eventId}`);
  const date = s.header?.competitions?.[0]?.date;
  let starters: Map<string, string> | undefined;
  if (date) {
    const ids = await soft("NHL schedule", () => nhlGameIds(easternDate(date)), new Map<string, number>(), notes);
    const comp = s.header.competitions[0];
    const ab = (ha: string) => toEspnAbbr(comp.competitors?.find((c: any) => c.homeAway === ha)?.team?.abbreviation ?? "");
    const gid = ids.get(`${ab("away")}@${ab("home")}`);
    if (gid) starters = await soft(`NHL box score ${gid}`, () => nhlStarters(gid), undefined, notes);
  }
  return parseResults(eventId, s, starters);
}
