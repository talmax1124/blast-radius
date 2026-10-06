import { normAbbr } from "./parks";
import { shiftDate } from "./parse";
import { americanToProb, holdOf, parseAmerican, probToAmerican } from "./odds";
import type { ApiSource, BookLine, BookProp, BookQuote, DeskNews, PropMarket } from "./types";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const TEAM_ABBR: Record<string, string> = {
  "arizona diamondbacks": "AZ",
  arizona: "AZ",
  "atlanta braves": "ATL",
  atlanta: "ATL",
  "baltimore orioles": "BAL",
  baltimore: "BAL",
  "boston red sox": "BOS",
  boston: "BOS",
  "chicago cubs": "CHC",
  "chicago c": "CHC",
  "chicago white sox": "CWS",
  "chicago ws": "CWS",
  "chicago w": "CWS",
  "cincinnati reds": "CIN",
  cincinnati: "CIN",
  "cleveland guardians": "CLE",
  cleveland: "CLE",
  "colorado rockies": "COL",
  colorado: "COL",
  "detroit tigers": "DET",
  detroit: "DET",
  "houston astros": "HOU",
  houston: "HOU",
  "kansas city royals": "KC",
  "kansas city": "KC",
  "los angeles angels": "LAA",
  "los angeles a": "LAA",
  "los angeles dodgers": "LAD",
  "los angeles d": "LAD",
  "miami marlins": "MIA",
  miami: "MIA",
  "milwaukee brewers": "MIL",
  milwaukee: "MIL",
  "minnesota twins": "MIN",
  minnesota: "MIN",
  "new york mets": "NYM",
  "new york m": "NYM",
  "new york yankees": "NYY",
  "new york y": "NYY",
  "oakland athletics": "ATH",
  athletics: "ATH",
  "a's": "ATH",
  as: "ATH",
  "philadelphia phillies": "PHI",
  philadelphia: "PHI",
  "pittsburgh pirates": "PIT",
  pittsburgh: "PIT",
  "san diego padres": "SD",
  "san diego": "SD",
  "san francisco giants": "SF",
  "san francisco": "SF",
  "seattle mariners": "SEA",
  seattle: "SEA",
  "st. louis cardinals": "STL",
  "st louis cardinals": "STL",
  "st. louis": "STL",
  "tampa bay rays": "TB",
  "tampa bay": "TB",
  "texas rangers": "TEX",
  texas: "TEX",
  "toronto blue jays": "TOR",
  toronto: "TOR",
  "washington nationals": "WSH",
  washington: "WSH",
};

export function nameToAbbr(raw: string): string {
  const key = raw.trim().toLowerCase().replace(/\./g, "");
  if (TEAM_ABBR[key]) return TEAM_ABBR[key];
  const compact = key.replace(/\s+/g, " ");
  if (TEAM_ABBR[compact]) return TEAM_ABBR[compact];
  return normAbbr(raw);
}

async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": UA },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json();
}

function dollars(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function emptyLine(): BookLine {
  return {
    mlAway: null,
    mlHome: null,
    spreadAway: null,
    spreadHome: null,
    spreadAwayPrice: null,
    spreadHomePrice: null,
    total: null,
    over: null,
    under: null,
  };
}

export type GamePatch = {
  awayAbbr: string;
  homeAbbr: string;
  quote: BookQuote;
  open?: BookLine | null;
};

export async function fetchPinnacle(): Promise<GamePatch[]> {
  const [matchups, markets] = await Promise.all([
    fetchJson("https://guest.api.arcadia.pinnacle.com/0.1/leagues/246/matchups", 15000) as Promise<
      Array<{
        id?: number;
        type?: string;
        parentId?: number | null;
        startTime?: string;
        participants?: Array<{ alignment?: string; name?: string }>;
      }>
    >,
    fetchJson("https://guest.api.arcadia.pinnacle.com/0.1/leagues/246/markets/straight", 15000) as Promise<
      Array<{
        matchupId?: number;
        type?: string;
        period?: number;
        prices?: Array<{ designation?: string; price?: number; points?: number }>;
      }>
    >,
  ]);
  const games = (matchups ?? []).filter((m) => m.type === "matchup" && !m.parentId);
  const byId = new Map<number, typeof markets>();
  for (const row of markets ?? []) {
    if (row.period !== 0 || row.matchupId == null) continue;
    const list = byId.get(row.matchupId) ?? [];
    list.push(row);
    byId.set(row.matchupId, list);
  }
  const out: GamePatch[] = [];
  for (const game of games) {
    const away = (game.participants ?? []).find((p) => p.alignment === "away")?.name;
    const home = (game.participants ?? []).find((p) => p.alignment === "home")?.name;
    if (!away || !home || game.id == null) continue;
    const rows = byId.get(game.id) ?? [];
    const line = emptyLine();
    const ml = rows.find((r) => r.type === "moneyline");
    for (const p of ml?.prices ?? []) {
      if (p.designation === "away") line.mlAway = p.price ?? null;
      if (p.designation === "home") line.mlHome = p.price ?? null;
    }
    const totals = rows.filter((r) => r.type === "total" && (r.prices ?? []).length >= 2);
    totals.sort((a, b) => {
      const ha = holdOf(a.prices?.find((p) => p.designation === "over")?.price ?? null, a.prices?.find((p) => p.designation === "under")?.price ?? null) ?? 1;
      const hb = holdOf(b.prices?.find((p) => p.designation === "over")?.price ?? null, b.prices?.find((p) => p.designation === "under")?.price ?? null) ?? 1;
      return ha - hb;
    });
    const tot = totals[0];
    if (tot) {
      for (const p of tot.prices ?? []) {
        if (p.designation === "over") {
          line.over = p.price ?? null;
          line.total = p.points ?? line.total;
        }
        if (p.designation === "under") {
          line.under = p.price ?? null;
          line.total = p.points ?? line.total;
        }
      }
    }
    if (line.mlHome == null && line.total == null) continue;
    out.push({
      awayAbbr: nameToAbbr(away),
      homeAbbr: nameToAbbr(home),
      quote: { id: 900, name: "Pinnacle", line },
    });
  }
  return out;
}

const UD_STAT: Record<string, PropMarket> = {
  "Home Runs": "hr",
  Hits: "hits",
  "Total Bases": "tb",
  RBIs: "rbi",
  "Stolen Bases": "sb",
  Strikeouts: "k",
  "Hits + Runs + RBIs": "hrrbi",
  Runs: "runs",
  "Fantasy Points": "fs",
};

export async function fetchUnderdogMlb(): Promise<BookProp[]> {
  const body = (await fetchJson("https://api.underdogfantasy.com/v1/over_under_lines", 18000)) as {
    games?: Array<{ id?: number; sport_id?: string }>;
    players?: Array<{ id?: string; first_name?: string; last_name?: string; sport_id?: string }>;
    appearances?: Array<{ id?: string; player_id?: string; match_id?: number }>;
    over_under_lines?: Array<{
      line_type?: string;
      stat_value?: number | string;
      over_under?: {
        appearance_stat?: { appearance_id?: string; display_stat?: string; stat?: string };
      };
      options?: Array<{ choice?: string; american_price?: string }>;
    }>;
  };
  const mlbGames = new Set((body.games ?? []).filter((g) => g.sport_id === "MLB").map((g) => g.id));
  const players = new Map((body.players ?? []).filter((p) => p.sport_id === "MLB").map((p) => [p.id, p]));
  const apps = new Map(
    (body.appearances ?? []).filter((a) => mlbGames.has(a.match_id)).map((a) => [a.id, a]),
  );
  const out: BookProp[] = [];
  const seen = new Set<string>();
  for (const line of body.over_under_lines ?? []) {
    if (line.line_type && line.line_type !== "balanced") continue;
    const ast = line.over_under?.appearance_stat;
    const app = ast?.appearance_id ? apps.get(ast.appearance_id) : undefined;
    if (!app?.player_id) continue;
    const player = players.get(app.player_id);
    if (!player) continue;
    const market = UD_STAT[ast?.display_stat ?? ""] ?? UD_STAT[ast?.stat ?? ""];
    if (!market) continue;
    const value = Number(line.stat_value);
    if (!Number.isFinite(value)) continue;
    let over: number | null = null;
    let under: number | null = null;
    for (const opt of line.options ?? []) {
      const price = parseAmerican(opt.american_price);
      const choice = String(opt.choice ?? "").toLowerCase();
      if (choice.startsWith("high") || choice === "over") over = price;
      if (choice.startsWith("low") || choice === "under") under = price;
    }
    const name = `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim();
    const key = `${name.toLowerCase()}|${market}|${value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name,
      teamAbbr: "",
      market,
      line: value,
      overAmerican: over,
      underAmerican: under,
      implied: over != null ? americanToProb(over) : 0,
      source: "Underdog",
    });
  }
  return out.slice(0, 160);
}

export async function fetchEspnBoard(date: string): Promise<GamePatch[]> {
  const stamp = date.replace(/-/g, "");
  const body = (await fetchJson(
    `https://site.web.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=${stamp}`,
    12000,
  )) as {
    events?: Array<{
      competitions?: Array<{
        competitors?: Array<{ homeAway?: string; team?: { abbreviation?: string } }>;
        odds?: Array<{
          provider?: { name?: string };
          overUnder?: number;
          moneyline?: { home?: { close?: { odds?: string }; open?: { odds?: string } }; away?: { close?: { odds?: string }; open?: { odds?: string } } };
          total?: { over?: { close?: { odds?: string } }; under?: { close?: { odds?: string } } };
        }>;
      }>;
    }>;
  };
  const out: GamePatch[] = [];
  for (const event of body.events ?? []) {
    const comp = event.competitions?.[0];
    if (!comp) continue;
    const away = comp.competitors?.find((c) => c.homeAway === "away")?.team?.abbreviation;
    const home = comp.competitors?.find((c) => c.homeAway === "home")?.team?.abbreviation;
    const odds = comp.odds?.[0];
    if (!away || !home || !odds) continue;
    const line = emptyLine();
    line.mlHome = parseAmerican(odds.moneyline?.home?.close?.odds);
    line.mlAway = parseAmerican(odds.moneyline?.away?.close?.odds);
    line.total = odds.overUnder ?? null;
    line.over = parseAmerican(odds.total?.over?.close?.odds);
    line.under = parseAmerican(odds.total?.under?.close?.odds);
    const open = emptyLine();
    open.mlHome = parseAmerican(odds.moneyline?.home?.open?.odds);
    open.mlAway = parseAmerican(odds.moneyline?.away?.open?.odds);
    out.push({
      awayAbbr: normAbbr(away),
      homeAbbr: normAbbr(home),
      quote: { id: 901, name: odds.provider?.name ?? "ESPN", line },
      open,
    });
  }
  return out;
}

export async function fetchKalshiMlb(): Promise<GamePatch[]> {
  const body = (await fetchJson(
    "https://api.elections.kalshi.com/trade-api/v2/markets?series_ticker=KXMLBGAME&status=open&limit=200",
    12000,
  )) as {
    markets?: Array<{
      event_ticker?: string;
      title?: string;
      yes_sub_title?: string;
      yes_bid_dollars?: string;
      yes_ask_dollars?: string;
      last_price_dollars?: string;
    }>;
  };
  const grouped = new Map<string, Array<{ abbr: string; american: number }>>();
  for (const m of body.markets ?? []) {
    const ticker = m.event_ticker ?? "";
    if (!ticker) continue;
    const bid = dollars(m.yes_bid_dollars);
    const ask = dollars(m.yes_ask_dollars);
    const last = dollars(m.last_price_dollars);
    const mid = bid && ask ? (bid + ask) / 2 : ask ?? bid ?? (last && last > 0.02 ? last : null);
    const american = mid != null ? probToAmerican(mid) : null;
    if (american == null) continue;
    const abbr = nameToAbbr((m.yes_sub_title ?? m.title ?? "").replace(/ wins$/i, ""));
    if (!abbr) continue;
    const list = grouped.get(ticker) ?? [];
    list.push({ abbr, american });
    grouped.set(ticker, list);
  }
  const out: GamePatch[] = [];
  for (const legs of grouped.values()) {
    if (legs.length < 2) continue;
    const line = emptyLine();
    line.mlAway = legs[0].american;
    line.mlHome = legs[1].american;
    out.push({
      awayAbbr: legs[0].abbr,
      homeAbbr: legs[1].abbr,
      quote: { id: 902, name: "Kalshi", line },
    });
  }
  return out;
}

export async function fetchTransactions(date: string): Promise<DeskNews[]> {
  const start = shiftDate(date, -2);
  const body = (await fetchJson(
    `https://statsapi.mlb.com/api/v1/transactions?sportId=1&startDate=${start}&endDate=${date}`,
    10000,
  )) as {
    transactions?: Array<{
      person?: { fullName?: string };
      toTeam?: { name?: string };
      fromTeam?: { name?: string };
      typeDesc?: string;
      description?: string;
      date?: string;
    }>;
  };
  const keep = /IL|injured|recall|option|designated|released|activated|status change|selected/i;
  const out: DeskNews[] = [];
  for (const t of body.transactions ?? []) {
    const desc = `${t.typeDesc ?? ""} ${t.description ?? ""}`;
    if (!keep.test(desc)) continue;
    const team = t.toTeam?.name ?? t.fromTeam?.name ?? "";
    out.push({
      name: t.person?.fullName ?? "",
      teamAbbr: team ? nameToAbbr(team) : "",
      headline: t.typeDesc ?? "Move",
      detail: t.description ?? "",
      date: t.date ?? date,
    });
  }
  return out.slice(0, 16);
}

async function ping(url: string, timeoutMs = 5000): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": UA },
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function pingFeeds(used: Record<string, boolean>): Promise<ApiSource[]> {
  const catalog: Omit<ApiSource, "status">[] = [
    { id: "mlb", name: "MLB Stats API", kind: "stats", used: true, note: "Slate, boxes, standings, transactions. No key." },
    { id: "savant", name: "Baseball Savant", kind: "stats", used: true, note: "Expected stats, barrels, arsenals. CSV, no key." },
    { id: "pp", name: "PrizePicks partner", kind: "pickem", used: true, note: "MLB pick'em board. No key." },
    { id: "rw", name: "RotoWire lineups", kind: "news", used: true, note: "Expected/confirmed orders. HTML." },
    { id: "meteo", name: "Open-Meteo", kind: "weather", used: true, note: "Park wind and temp. No key." },
    { id: "nws", name: "NWS weather.gov", kind: "weather", used: false, note: "Official grid forecast. No key. Open-Meteo covers the desk." },
    { id: "an", name: "Action Network", kind: "odds", used: true, note: "Consensus, Open, DK, FD, MGM, BetRivers." },
    { id: "bovada", name: "Bovada", kind: "odds", used: true, note: "Player props: HR, hits, TB, RBI, SB, Ks, H+R+RBI." },
    { id: "pinn", name: "Pinnacle guest", kind: "odds", used: true, note: "Sharp moneyline and total. No key." },
    { id: "ud", name: "Underdog Fantasy", kind: "pickem", used: true, note: "MLB over/unders. HTTP/2 board, no key." },
    { id: "espn", name: "ESPN scoreboard", kind: "odds", used: true, note: "DraftKings open/close on the public board." },
    { id: "kalshi", name: "Kalshi", kind: "odds", used: true, note: "Prediction-market moneyline. No key." },
    { id: "poly", name: "Polymarket", kind: "odds", used: false, note: "Public search lives; MLB events are stale." },
    { id: "sleeper", name: "Sleeper", kind: "pickem", used: false, note: "State lives. MLB projections empty this week." },
    { id: "score", name: "theScore", kind: "stats", used: false, note: "Lives but dumps 18MB. Too heavy for the tick." },
    { id: "sofa", name: "Sofascore", kind: "stats", used: false, note: "403 from this desk." },
    { id: "fg", name: "FanGraphs", kind: "stats", used: false, note: "Cloudflare challenge. Need a browser." },
    { id: "dk", name: "DraftKings sportsbook", kind: "odds", used: false, note: "403. No public developer API." },
    { id: "oddsapi", name: "The Odds API", kind: "odds", used: false, note: "Free 500 credits/mo. Needs a key." },
    { id: "sharp", name: "SharpAPI", kind: "odds", used: false, note: "Free 12 req/min. Needs a key." },
    { id: "papi", name: "OddsPapi", kind: "odds", used: false, note: "Free 250 req/mo. Needs a key." },
    { id: "sgo", name: "SportsGameOdds", kind: "odds", used: false, note: "Amateur tier needs a key." },
    { id: "owm", name: "OpenWeather", kind: "weather", used: false, note: "401 without a key." },
  ];
  const checks: Record<string, string> = {
    mlb: "https://statsapi.mlb.com/api/v1/standings?leagueId=103,104&season=2026",
    savant: "https://baseballsavant.mlb.com/leaderboard/expected_statistics?type=batter&year=2026&min=50&csv=true",
    pp: "https://partner-api.prizepicks.com/projections?league_id=2&per_page=1",
    meteo: "https://api.open-meteo.com/v1/forecast?latitude=40.8&longitude=-73.9&current=temperature_2m",
    nws: "https://api.weather.gov/",
    an: "https://api.actionnetwork.com/web/v1/scoreboard/mlb",
    pinn: "https://guest.api.arcadia.pinnacle.com/0.1/sports/3/leagues?all=false&brandId=0",
    espn: "https://site.web.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard",
    kalshi: "https://api.elections.kalshi.com/trade-api/v2/events?limit=1&status=open&series_ticker=KXMLBGAME",
    poly: "https://gamma-api.polymarket.com/events?closed=false&limit=1",
    sleeper: "https://api.sleeper.app/v1/state/mlb",
    sofa: "https://api.sofascore.com/api/v1/sport/baseball/scheduled-events/2026-09-14",
  };
  const keyed = new Set(["oddsapi", "sharp", "papi", "sgo", "owm", "dk", "fg"]);
  const blockedKnown = new Set(["dk", "fg", "sofa"]);
  const live = await Promise.all(
    catalog.map(async (row) => {
      if (keyed.has(row.id)) return { ...row, status: "key" as const };
      if (blockedKnown.has(row.id) && !checks[row.id]) return { ...row, status: "blocked" as const };
      const url = checks[row.id];
      if (!url) return { ...row, status: used[row.id] ? ("live" as const) : ("idle" as const) };
      const ok = await ping(url);
      if (ok) return { ...row, status: "live" as const };
      return { ...row, status: blockedKnown.has(row.id) ? ("blocked" as const) : ("idle" as const) };
    }),
  );
  return live;
}
