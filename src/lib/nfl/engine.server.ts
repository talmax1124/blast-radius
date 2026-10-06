import { buildSlips, quoteCover } from "./slips.ts";
import {
  RZM,
  addLine,
  applyAir,
  emptyLine,
  impliedPoints,
  permRatio,
  projectRoster,
  reseatAbsences,
  teamMass,
  usageShell,
  weekWeight,
  type Pos,
  type RosterPlayer,
  type WeekLine,
} from "./score.ts";
import type {
  GameState,
  ListedProp,
  MatchSheet,
  NflActual,
  NflBoard,
  NflGame,
  NflMarket,
  NflPick,
  NflQuote,
  OddsType,
  PropLean,
  SheetPlayer,
} from "./types.ts";

const ESPN = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";
const SLEEPER = "https://api.sleeper.app/v1";
const UA = "GreatRun/NFL-1.0";

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

async function getJson<T>(url: string, timeout = 18000): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": UA },
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) throw new Error(`${res.status} ${url.split("?")[0]}`);
  return (await res.json()) as T;
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function normTeam(raw: string): string {
  const t = raw.trim().toUpperCase();
  const map: Record<string, string> = {
    WAS: "WSH",
    WSH: "WSH",
    JAC: "JAX",
    JAX: "JAX",
    LA: "LAR",
    LAR: "LAR",
    LV: "LV",
    OAK: "LV",
    SD: "LAC",
    STL: "LAR",
    ARZ: "ARI",
    GBP: "GB",
    KAN: "KC",
    NWE: "NE",
    NOR: "NO",
    SFO: "SF",
    TAM: "TB",
  };
  return map[t] ?? t;
}

function todayEt(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function lineFromStat(v: Record<string, unknown>): WeekLine {
  return {
    passAtt: num(v.pass_att),
    passYd: num(v.pass_yd),
    passTd: num(v.pass_td),
    ints: num(v.pass_int),
    rushAtt: num(v.rush_att),
    rushYd: num(v.rush_yd),
    rushTd: num(v.rush_td),
    tgt: num(v.rec_tgt),
    rec: num(v.rec),
    recYd: num(v.rec_yd),
    recTd: num(v.rec_td),
  };
}

function injuryMult(status: unknown): number {
  const s = String(status ?? "").toLowerCase();
  if (!s || s === "null" || s === "none") return 1;
  if (s.includes("out") || s === "ir" || s.includes("pup") || s.includes("suspend")) return 0;
  if (s.includes("doubt")) return 0.22;
  if (s.includes("question")) return 0.82;
  return 1;
}

/** Official tag is still doubtful. He did not practice and is not in the game plan. */


type Person = {
  id: string;
  name: string;
  pos: Pos;
  team: string;
  espnId: number | null;
  injury: number;
  status: string;
};

async function loadPeople(): Promise<Person[]> {
  return cached("sleeper:players:nfl:v2", 6 * 60 * 60_000, async () => {
    const data = await getJson<Record<string, Record<string, unknown>>>(`${SLEEPER}/players/nfl`, 40000);
    const out: Person[] = [];
    for (const [id, p] of Object.entries(data)) {
      const pos = String(p.position ?? "");
      if (pos !== "QB" && pos !== "RB" && pos !== "WR" && pos !== "TE") continue;
      const team = normTeam(String(p.team ?? ""));
      if (!team || team === "NULL") continue;
      const name = String(p.full_name ?? "").trim();
      if (!name) continue;
      const espn = num(p.espn_id);
      out.push({
        id,
        name,
        pos,
        team,
        espnId: espn > 0 ? espn : null,
        injury: injuryMult(p.injury_status),
        status: String(p.injury_status ?? ""),
      });
    }
    return out;
  });
}

type PriorWeek = { week: number; byPlayer: Map<string, WeekLine> };

async function loadWeekStats(season: number, week: number): Promise<PriorWeek> {
  return cached(`sleeper:stats:${season}:${week}`, 30 * 60_000, async () => {
    const data = await getJson<Record<string, Record<string, unknown>>>(
      `${SLEEPER}/stats/nfl/regular/${season}/${week}`,
    );
    const byPlayer = new Map<string, WeekLine>();
    for (const [id, row] of Object.entries(data)) {
      if (!/^\d+$/.test(id)) continue;
      const line = lineFromStat(row);
      if (line.passAtt + line.rushAtt + line.tgt <= 0) continue;
      byPlayer.set(id, line);
    }
    return { week, byPlayer };
  });
}

type RawEvent = {
  id?: string;
  competitions?: Array<{
    neutralSite?: boolean;
    venue?: { fullName?: string };
    status?: { type?: { state?: string; shortDetail?: string } };
    odds?: Array<{ details?: string; overUnder?: number; spread?: number }>;
    competitors?: Array<{
      homeAway?: string;
      score?: string;
      team?: { abbreviation?: string };
    }>;
  }>;
};

async function loadWeekGames(season: number, week: number): Promise<NflGame[]> {
  return cached(`espn:week:${season}:${week}`, 3 * 60_000, async () => {
    const data = await getJson<{ events?: RawEvent[] }>(
      `${ESPN}/scoreboard?dates=${season}&seasontype=2&week=${week}`,
    );
    const games: NflGame[] = [];
    for (const event of data.events ?? []) {
      const c = event.competitions?.[0];
      if (!c || !event.id) continue;
      const sides = c.competitors ?? [];
      const home = sides.find((s) => s.homeAway === "home");
      const away = sides.find((s) => s.homeAway === "away");
      if (!home?.team?.abbreviation || !away?.team?.abbreviation) continue;
      const stateRaw = c.status?.type?.state;
      const state: GameState = stateRaw === "in" ? "in" : stateRaw === "post" ? "post" : "pre";
      const odds = c.odds?.[0];
      const scoreOf = (s: { score?: string } | undefined) => {
        if (state === "pre") return null;
        const n = Number(s?.score);
        return Number.isFinite(n) ? n : null;
      };
      games.push({
        id: String(event.id),
        away: normTeam(away.team.abbreviation),
        home: normTeam(home.team.abbreviation),
        awayScore: scoreOf(away),
        homeScore: scoreOf(home),
        state,
        detail: c.status?.type?.shortDetail ?? "",
        spreadLabel: odds?.details ?? null,
        total: odds?.overUnder != null ? num(odds.overUnder) : null,
        venue: c.venue?.fullName ?? "",
        neutral: Boolean(c.neutralSite),
      });
    }
    return games;
  });
}

function teamSpread(team: string, game: NflGame): number | null {
  const label = game.spreadLabel;
  if (!label) return null;
  const m = label.trim().match(/^([A-Za-z]+)\s*([+-]?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const fav = normTeam(m[1] ?? "");
  const line = Number(m[2]);
  if (!Number.isFinite(line)) return null;
  return team === fav ? line : -line;
}

function rateFactor(numer: number, denom: number, league: number, pseudo: number): number {
  if (denom + pseudo <= 0) return 1;
  const rate = (numer + league * pseudo) / (denom + pseudo);
  return Math.min(1.18, Math.max(0.84, rate / league));
}

type BoxSide = {
  team?: { abbreviation?: string };
  statistics?: Array<{
    name?: string;
    labels?: string[];
    athletes?: Array<{ athlete?: { id?: string; displayName?: string }; stats?: string[] }>;
  }>;
};

function idx(labels: string[], ...names: string[]): number {
  const lower = labels.map((l) => l.toLowerCase());
  for (const n of names) {
    const i = lower.indexOf(n.toLowerCase());
    if (i >= 0) return i;
  }
  return -1;
}

function statNum(stats: string[], i: number): number {
  if (i < 0) return 0;
  const n = Number(String(stats[i] ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

type Boxed = NflActual & { espnId: number; name: string; team: string };

async function loadActuals(gameIds: string[]): Promise<Boxed[]> {
  const map = new Map<number, Boxed>();
  const queue = [...gameIds];
  async function pull(id: string) {
    const data = await getJson<{ boxscore?: { players?: BoxSide[] } }>(`${ESPN}/summary?event=${id}`, 14000);
    for (const side of data.boxscore?.players ?? []) {
      const team = normTeam(String(side.team?.abbreviation ?? ""));
      for (const group of side.statistics ?? []) {
        const labels = group.labels ?? [];
        const name = (group.name ?? "").toLowerCase();
        if (name !== "passing" && name !== "rushing" && name !== "receiving") continue;
        for (const row of group.athletes ?? []) {
          const espn = Number(row.athlete?.id);
          const who = row.athlete?.displayName ?? "";
          if (!espn || !who) continue;
          const stats = row.stats ?? [];
          const cur = map.get(espn) ?? {
            espnId: espn,
            name: who,
            team,
            passYd: 0,
            passTd: 0,
            ints: 0,
            rushYd: 0,
            rushTd: 0,
            rec: 0,
            recYd: 0,
            recTd: 0,
            played: false,
          };
          if (name === "passing") {
            cur.passYd = statNum(stats, idx(labels, "YDS"));
            cur.passTd = statNum(stats, idx(labels, "TD"));
            cur.ints = statNum(stats, idx(labels, "INT"));
            cur.played = true;
          } else if (name === "rushing") {
            cur.rushYd = statNum(stats, idx(labels, "YDS"));
            cur.rushTd = statNum(stats, idx(labels, "TD"));
            cur.played = true;
          } else if (name === "receiving") {
            cur.rec = statNum(stats, idx(labels, "REC"));
            cur.recYd = statNum(stats, idx(labels, "YDS"));
            cur.recTd = statNum(stats, idx(labels, "TD"));
            cur.played = true;
          }
          if (cur.played) map.set(espn, cur);
        }
      }
    }
  }
  async function worker() {
    while (queue.length) {
      const id = queue.shift();
      if (!id) return;
      try {
        await pull(id);
      } catch {
        try {
          await pull(id);
        } catch {
          /* one box can fail */
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, gameIds.length) }, () => worker()));
  return [...map.values()];
}

const STAT_MARKET: Record<string, NflMarket> = {
  "pass yards": "pass",
  "passing yards": "pass",
  "rush yards": "rush",
  "rushing yards": "rush",
  "receiving yards": "recyd",
  "rec yards": "recyd",
  receptions: "rec",
  "pass tds": "passtd",
  "passing tds": "passtd",
  "pass touchdowns": "passtd",
  touchdowns: "atd",
  "anytime tds": "atd",
  "anytime td": "atd",
  "anytime touchdowns": "atd",
  "rush+rec tds": "atd",
  "fantasy score": "fant",
  "fantasy points": "fant",
};

type PpLine = { name: string; team: string; market: NflMarket; stat: string; line: number; oddsType: OddsType };

function keyName(n: string): string {
  return n
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const SUFFIX = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

function sameName(player: string, line: string): boolean {
  const x = keyName(player);
  const y = keyName(line);
  if (!x || !y || y.includes(" and ") || x.includes(" and ")) return false;
  if (x === y) return true;
  if (y.startsWith(`${x} `) && SUFFIX.has(y.slice(x.length + 1))) return true;
  if (x.startsWith(`${y} `) && SUFFIX.has(x.slice(y.length + 1))) return true;
  return false;
}

function teamOk(raw: string, playerTeam: string): boolean {
  const parts = raw
    .split(/[/|]/)
    .map((part) => normTeam(part.trim()))
    .filter(Boolean);
  if (!parts.length) return true;
  return parts.includes(playerTeam);
}

async function loadPrizePicks(): Promise<PpLine[]> {
  return cached("pp:nfl:v1", 4 * 60_000, async () => {
    const urls = [9, 1].flatMap((id) => [
      `https://partner-api.prizepicks.com/projections?league_id=${id}&per_page=250&single_stat=true&game_mode=pickem`,
      `https://api.prizepicks.com/projections?league_id=${id}&per_page=250&single_stat=true`,
    ]);
    for (const url of urls) {
      try {
        const res = await fetch(url, {
          headers: {
            Accept: "application/json",
            Origin: "https://app.prizepicks.com",
            Referer: "https://app.prizepicks.com/",
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          },
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) continue;
        const body = (await res.json()) as {
          data?: Array<{ attributes?: Record<string, unknown>; relationships?: Record<string, { data?: { id?: string } }> }>;
          included?: Array<{ id?: string; type?: string; attributes?: Record<string, unknown> }>;
        };
        const league = (body.included ?? []).find((o) => o.type === "league");
        const leagueName = String(league?.attributes?.name ?? "").toLowerCase();
        if (leagueName && !leagueName.includes("nfl") && !leagueName.includes("football")) continue;
        const players = new Map<string, { name: string; team: string }>();
        for (const obj of body.included ?? []) {
          if (obj.type !== "new_player" || !obj.id) continue;
          const a = obj.attributes ?? {};
          players.set(String(obj.id), {
            name: String(a.name ?? a.display_name ?? ""),
            team: normTeam(String(a.team ?? "")),
          });
        }
        const out: PpLine[] = [];
        for (const row of body.data ?? []) {
          const a = row.attributes ?? {};
          const stat = String(a.stat_type ?? "");
          const market = STAT_MARKET[stat.toLowerCase()];
          if (!market) continue;
          const line = num(a.line_score);
          if (!line) continue;
          const pid = String(row.relationships?.new_player?.data?.id ?? "");
          const player = players.get(pid);
          if (!player?.name) continue;
          const oddsRaw = String(a.odds_type ?? "standard");
          const oddsType: OddsType = oddsRaw === "demon" || oddsRaw === "goblin" ? oddsRaw : "standard";
          out.push({ name: player.name, team: player.team, market, stat, line, oddsType });
        }
        if (out.length) return out;
      } catch {
        /* next url */
      }
    }
    return [];
  });
}

function attachQuotes(pick: NflPick, lines: PpLine[]): NflQuote[] {
  const quotes: NflQuote[] = [];
  for (const line of lines) {
    if (!teamOk(line.team, pick.team)) continue;
    if (!sameName(pick.name, line.name)) continue;
    const projection = projectionNumber(pick, line.market);
    quotes.push({
      market: line.market,
      stat: line.stat,
      line: line.line,
      oddsType: line.oddsType,
      projection,
      cover: quoteCover(pick, line.market, line.line),
    });
  }
  return quotes.sort((a, b) => {
    const rank = (odds: OddsType) => (odds === "standard" ? 0 : odds === "goblin" ? 1 : 2);
    return rank(a.oddsType) - rank(b.oddsType) || b.cover - a.cover;
  });
}

function projectionNumber(pick: NflPick, market: NflMarket): number {
  switch (market) {
    case "atd":
      return pick.lambda;
    case "pass":
      return pick.expPassYd;
    case "rush":
      return pick.expRushYd;
    case "recyd":
      return pick.expRecYd;
    case "rec":
      return pick.expRec;
    case "passtd":
      return pick.expPassTd;
    case "fant":
      return pick.expFantasy;
  }
}

function airOf(game: NflGame): number {
  if (game.neutral) return 1;
  const v = game.venue.toLowerCase();
  if (v.includes("mile high") || v.includes("empower field")) return 1.035;
  return 1;
}

function nightGame(games: NflGame[]): NflGame | undefined {
  return games.find(
    (g) => (g.home === "DEN" && g.away === "LAR") || (g.home === "LAR" && g.away === "DEN"),
  );
}

async function kickoffNote(game: NflGame): Promise<string> {
  let temp = "";
  let sky = "";
  let wind = "";
  let rain = "";
  let grass = false;
  try {
    const data = await cached(`espn:wx:v2:${game.id}`, 10 * 60_000, () =>
      getJson<{
        gameInfo?: {
          venue?: { grass?: boolean };
          weather?: {
            temperature?: number;
            displayValue?: string;
            precipitation?: number;
            gust?: number;
            wind?: { displayValue?: string };
          };
        };
      }>(`${ESPN}/summary?event=${game.id}`, 8000),
    );
    const w = data.gameInfo?.weather;
    grass = Boolean(data.gameInfo?.venue?.grass);
    if (w) {
      if (typeof w.temperature === "number") temp = `${Math.round(w.temperature)}°`;
      sky = w.displayValue ?? "";
      if (typeof w.gust === "number") wind = `gusts ${Math.round(w.gust)} mph`;
      else if (w.wind?.displayValue) wind = `wind ${w.wind.displayValue}`;
      if (typeof w.precipitation === "number") rain = `${Math.round(w.precipitation)}% rain chance`;
    }
  } catch {
    /* venue still prints */
  }
  const place = [game.venue, grass ? "grass" : ""].filter(Boolean).join(", ");
  const head = [temp, sky, wind, rain, place].filter(Boolean).join(", ");
  const gustN = wind.startsWith("gusts ") ? Number(wind.replace(/[^0-9.]/g, "")) : null;
  const air =
    airOf(game) > 1
      ? "Mile High air adds 3.5% to pass and receiving yards and 2% to passing touchdowns."
      : "";
  const dock =
    gustN == null ? "" : gustN < 15 ? "Gusts are under 15 mph, so there is no wind dock." : "Gusts are high enough to trim deep throws.";
  const rainNote = rain ? "A rain chance is not a played total." : "";
  return [head, air, dock, rainNote]
    .filter(Boolean)
    .map((s) => s.replace(/\.$/, ""))
    .join(". ")
    .concat(".");
}

function statusWord(raw: string): string {
  const s = raw.toLowerCase();
  if (!s || s === "null" || s === "none") return "Active";
  if (s.includes("doubt")) return "Doubtful";
  if (s.includes("question")) return "Questionable";
  if (s.includes("out") || s === "ir" || s.includes("pup") || s.includes("suspend")) return "Out";
  return raw;
}

function formOf(pos: string, weeks: { week: number; line: WeekLine }[], trained: number[]): string {
  const sorted = [...weeks].sort((a, b) => a.week - b.week);
  const have = new Set(sorted.map((w) => w.week));
  const parts = sorted.map(({ week, line }) => {
    if (pos === "QB") {
      return `W${week} ${Math.round(line.passAtt)} att, ${Math.round(line.passYd)} yd, ${Math.round(line.passTd)} TD`;
    }
    if (pos === "RB") {
      const rushTd = line.rushTd > 0 ? `, ${Math.round(line.rushTd)} TD` : "";
      const rec = line.tgt > 0 ? `, ${Math.round(line.rec)}-${Math.round(line.recYd)} rec` : "";
      return `W${week} ${Math.round(line.rushAtt)}-${Math.round(line.rushYd)} rush${rushTd}${rec}`;
    }
    const td = line.recTd > 0 ? `, ${Math.round(line.recTd)} TD` : "";
    const tgts = Math.round(line.tgt);
    return `W${week} ${Math.round(line.rec)}-${Math.round(line.recYd)} on ${tgts} tgt${tgts === 1 ? "" : "s"}${td}`;
  });
  const span = trained.length ? [...trained].sort((a, b) => a - b) : [...have].sort((a, b) => a - b);
  const missing: string[] = [];
  for (const w of span) {
    if (!have.has(w)) missing.push(`No week ${w}`);
  }
  return [...parts, ...missing].join(". ");
}

const SHEET_MARKETS: Record<string, NflMarket[]> = {
  QB: ["pass", "passtd", "rush", "atd", "fant"],
  RB: ["rush", "rec", "recyd", "atd", "fant"],
  WR: ["rec", "recyd", "atd", "fant"],
  TE: ["rec", "recyd", "atd", "fant"],
};

function lineBand(market: NflMarket, line: number): boolean {
  if (market === "pass") return line >= 175 && line <= 350;
  if (market === "rush") return line >= 30 && line <= 120;
  if (market === "recyd") return line >= 25 && line <= 120;
  if (market === "rec") return line >= 2.5 && line <= 9.5;
  if (market === "passtd") return line >= 0.5 && line <= 2.5;
  if (market === "fant") return line >= 12 && line <= 40;
  if (market === "atd") return Math.abs(line - 0.5) < 0.01;
  return false;
}

function leanOf(cover: number | null, playable: boolean): PropLean {
  if (!playable || cover == null) return "no play";
  if (cover >= 0.57) return "over";
  if (cover <= 0.43) return "under";
  return "no play";
}

function sheetProps(pick: NflPick): ListedProp[] {
  const markets = SHEET_MARKETS[pick.pos] ?? SHEET_MARKETS.WR ?? [];
  const out: ListedProp[] = [];
  for (const market of markets) {
    const quote = pick.quotes.find((q) => q.market === market && q.oddsType === "standard");
    const projection = market === "atd" ? pick.pTd : projectionNumber(pick, market);
    const worth =
      quote != null ||
      (market === "atd" && projection >= 0.05) ||
      (market === "rec" && projection >= 0.4) ||
      (market === "passtd" && projection >= 0.35) ||
      (market === "fant" && projection >= 4) ||
      ((market === "pass" || market === "rush" || market === "recyd") && projection >= 4);
    if (!worth) continue;
    const playable = quote != null && lineBand(market, quote.line);
    out.push({
      market,
      stat: quote?.stat ?? market,
      projection,
      line: quote?.line ?? null,
      cover: quote?.cover ?? null,
      lean: leanOf(quote?.cover ?? null, playable),
    });
  }
  return out;
}

function buildMatch(
  game: NflGame,
  picks: NflPick[],
  people: Person[],
  weeks: Map<string, { week: number; line: WeekLine }[]>,
  weather: string,
  trained: number[],
): MatchSheet {
  const byId = new Map(people.map((p) => [p.id, p]));
  const players: SheetPlayer[] = picks
    .filter((p) => p.gameId === game.id)
    .map((p) => {
      const who = byId.get(p.id);
      return {
        id: p.id,
        name: p.name,
        pos: p.pos,
        team: p.team,
        opp: p.opp,
        espnId: p.espnId,
        status: statusWord(who?.status ?? ""),
        form: formOf(p.pos, weeks.get(p.id) ?? [], trained),
        pTd: p.pTd,
        expPassYd: p.expPassYd,
        expRushYd: p.expRushYd,
        expRec: p.expRec,
        expRecYd: p.expRecYd,
        expPassTd: p.expPassTd,
        expFantasy: p.expFantasy,
        reasons: p.reasons.filter((r) => r.startsWith("Vacated")),
        props: sheetProps(p),
      };
    })
    .filter(
      (p) =>
        p.status !== "Active" ||
        p.reasons.length > 0 ||
        p.expFantasy >= 3 ||
        p.props.some((q) => q.line != null),
    )
    .sort((a, b) => (a.team === b.team ? b.expFantasy - a.expFantasy : a.team === game.away ? -1 : 1));
  return {
    gameId: game.id,
    away: game.away,
    home: game.home,
    detail: game.detail,
    spread: game.spreadLabel,
    total: game.total,
    venue: game.venue,
    weather,
    note: "Fit on weeks 1–2 only. Tonight’s box does not train the card. Puka Nacua is out — he did not practice, and the doubtful tag is priced as inactive. His week-1 role moves in full, by actual target share. Questionable keeps 82%. Over and under are standard lines inside a sane band. A short or goblin number can show an edge and still read Pass.",
    players,
  };
}

export async function buildNflBoard(date = todayEt()): Promise<NflBoard> {
  const state = await getJson<{ week?: number; season?: string }>(`${SLEEPER}/state/nfl`);
  const week = num(state.week) || 1;
  const season = num(state.season) || 2026;
  const priorWeeks = Array.from({ length: Math.min(4, Math.max(0, week - 1)) }, (_, i) => week - 1 - i).filter((w) => w >= 1);

  const [rosterFeed, priors, games, lines, priorBuckets] = await Promise.all([
    loadPeople(),
    Promise.all(priorWeeks.map((w) => loadWeekStats(season, w))),
    loadWeekGames(season, week),
    loadPrizePicks().catch(() => [] as PpLine[]),
    Promise.all(
      priorWeeks.map(async (w) => ({
        week: w,
        games: await loadWeekGames(season, w).catch(() => [] as NflGame[]),
      })),
    ),
  ]);

  const people = rosterFeed;
  const latest = Math.max(1, ...priorWeeks);
  const teamWeek = new Map<string, Map<number, WeekLine>>();
  const playerWeeks = new Map<string, { week: number; line: WeekLine }[]>();
  const peopleById = new Map(people.map((p) => [p.id, p]));

  for (const prior of priors) {
    for (const [id, line] of prior.byPlayer) {
      const person = peopleById.get(id);
      if (!person) continue;
      const list = playerWeeks.get(id) ?? [];
      list.push({ week: prior.week, line });
      playerWeeks.set(id, list);
      const byWeek = teamWeek.get(person.team) ?? new Map<number, WeekLine>();
      const acc = byWeek.get(prior.week) ?? emptyLine();
      addLine(acc, line, 1);
      byWeek.set(prior.week, acc);
      teamWeek.set(person.team, byWeek);
    }
  }

  const pointsFor = new Map<string, { pts: number; games: number }>();
  const pointsAllowed = new Map<string, { pts: number; games: number }>();
  for (const bucket of priorBuckets) {
    for (const g of bucket.games) {
      if (g.state !== "post" || g.homeScore == null || g.awayScore == null) continue;
      const add = (club: string, pts: number, allowedPts: number) => {
        const pf = pointsFor.get(club) ?? { pts: 0, games: 0 };
        pf.pts += pts;
        pf.games += 1;
        pointsFor.set(club, pf);
        const pa = pointsAllowed.get(club) ?? { pts: 0, games: 0 };
        pa.pts += allowedPts;
        pa.games += 1;
        pointsAllowed.set(club, pa);
      };
      add(g.home, g.homeScore, g.awayScore);
      add(g.away, g.awayScore, g.homeScore);
    }
  }

  const slateTeams = new Set<string>();
  for (const g of games) {
    slateTeams.add(g.home);
    slateTeams.add(g.away);
  }

  const night = nightGame(games);
  const [actuals, weather] = await Promise.all([
    loadActuals(games.filter((g) => g.state !== "pre").map((g) => g.id)),
    night ? kickoffNote(night) : Promise.resolve(""),
  ]);
  const gameByTeam = new Map<string, NflGame>();
  for (const g of games) {
    gameByTeam.set(g.home, g);
    gameByTeam.set(g.away, g);
  }

  const picks: NflPick[] = [];
  for (const team of slateTeams) {
    const game = gameByTeam.get(team);
    if (!game) continue;
    const opp = game.home === team ? game.away : game.home;
    const home = game.home === team;
    const byWeek = teamWeek.get(team);
    const off = emptyLine();
    let weight = 0;
    for (const [w, line] of byWeek ?? []) {
      const wt = weekWeight(w, latest);
      addLine(off, line, wt);
      weight += wt;
    }
    const allowed = emptyLine();
    let defW = 0;
    for (const bucket of priorBuckets) {
      for (const g of bucket.games) {
        if (g.state !== "post") continue;
        if (g.home !== team && g.away !== team) continue;
        const foe = g.home === team ? g.away : g.home;
        const foeLine = teamWeek.get(foe)?.get(bucket.week);
        if (!foeLine) continue;
        const wt = weekWeight(bucket.week, latest);
        addLine(allowed, foeLine, wt);
        defW += wt;
      }
    }
    const priced = impliedPoints({
      spread: teamSpread(team, game),
      total: game.total,
      pointsFor: pointsFor.get(team)?.pts ?? 0,
      games: pointsFor.get(team)?.games ?? 0,
      oppPointsAllowed: pointsAllowed.get(opp)?.pts ?? 0,
      oppGames: pointsAllowed.get(opp)?.games ?? 0,
      home,
      neutral: game.neutral,
    });
    const mass = teamMass(
      off,
      weight,
      permRatio(allowed.passTd, defW, RZM.leaguePassTd),
      permRatio(allowed.rushTd, defW, RZM.leagueRushTd),
      rateFactor(allowed.passYd, allowed.passAtt, RZM.leaguePassYpa, 90),
      rateFactor(allowed.rushYd, allowed.rushAtt, RZM.leagueYpc, 40),
      priced,
    );
    const roster: RosterPlayer[] = [];
    for (const person of people) {
      if (person.team !== team || person.injury <= 0) continue;
      const weeks = playerWeeks.get(person.id) ?? [];
      if (!weeks.length) continue;
      const line = emptyLine();
      let gms = 0;
      for (const row of weeks) {
        addLine(line, row.line, weekWeight(row.week, latest));
        gms += 1;
      }
      const touches = line.passAtt + line.rushAtt + line.tgt;
      if (touches < 4 && !(person.pos === "QB" && line.passAtt >= 8)) continue;
      roster.push({
        id: person.id,
        name: person.name,
        pos: person.pos,
        espnId: person.espnId,
        team,
        opp,
        line,
        games: gms,
        injury: person.injury,
      });
    }
    let scored = projectRoster(roster, off, mass, {
      team,
      opp,
      implied: priced.implied,
      script: priced.script,
      fromBook: priced.fromBook,
    });
    const coreIds = new Set(roster.map((p) => p.id));
    const extras: RosterPlayer[] = [];
    for (const person of people) {
      if (person.team !== team || person.pos === "QB" || coreIds.has(person.id)) continue;
      const weeks = playerWeeks.get(person.id) ?? [];
      if (!weeks.length) continue;
      const line = emptyLine();
      let gms = 0;
      for (const row of weeks) {
        addLine(line, row.line, weekWeight(row.week, latest));
        gms += 1;
      }
      if (line.rushAtt + line.tgt < 1.2) continue;
      extras.push({
        id: person.id,
        name: person.name,
        pos: person.pos,
        espnId: person.espnId,
        team,
        opp,
        line,
        games: gms,
        injury: person.injury > 0 ? person.injury : 1,
      });
    }
    const injuryMap = new Map<string, number>(roster.map((p) => [p.id, p.injury]));
    for (const extra of extras) {
      const person = peopleById.get(extra.id);
      injuryMap.set(extra.id, person && person.injury <= 0 ? 0 : extra.injury);
    }
    const env = {
      team,
      opp,
      implied: priced.implied,
      script: priced.script,
      fromBook: priced.fromBook,
    };
    scored = reseatAbsences(
      [...scored, ...extras.map((p) => usageShell(p, off, mass, env))],
      injuryMap,
    ).filter((p) => (injuryMap.get(p.id) ?? 1) > 0);
    const air = airOf(game);
    if (air !== 1) scored = applyAir(scored, air, 1.02);
    for (const row of scored) {
      const boxed =
        (row.espnId ? actuals.find((a) => a.espnId === row.espnId) : undefined) ??
        actuals.find((a) => a.team === team && sameName(row.name, a.name));
      const pick: NflPick = {
        ...row,
        espnId: row.espnId ?? boxed?.espnId ?? null,
        rank: 0,
        gameId: game.id,
        gameState: game.state,
        actual: boxed?.played ? boxed : null,
        quotes: [],
      };
      pick.quotes = attachQuotes(pick, lines);
      picks.push(pick);
    }
  }

  const goalPool = picks
    .filter((p) => p.lambda >= 0.08)
    .sort((a, b) => b.pTd - a.pTd || b.lambda - a.lambda);
  const goalLine = goalPool.slice(0, 12).map((p, i) => ({ ...p, rank: i + 1 }));

  const props = picks
    .filter(
      (p) =>
        p.quotes.length > 0 ||
        p.expPassYd >= 165 ||
        p.expRushYd >= 38 ||
        p.expRecYd >= 32 ||
        p.expRec >= 3 ||
        p.lambda >= 0.12,
    )
    .sort((a, b) => {
      const ae = a.quotes[0]?.cover ?? a.pTd;
      const be = b.quotes[0]?.cover ?? b.pTd;
      return be - ae;
    })
    .slice(0, 48)
    .map((p, i) => ({ ...p, rank: i + 1 }));

  const slips = buildSlips(picks, lines.length);
  const matched = picks.reduce((n, p) => n + p.quotes.length, 0);
  const bookGames = games.filter((g) => g.total != null).length;
  const notes = [
    `Red-Zone Mass ${RZM.version}. Priced from weeks ${priorWeeks.slice().sort((a, b) => a - b).join("–") || "none"}. This week’s boxes grade the card. They do not train it.`,
    bookGames
      ? `${bookGames} game${bookGames === 1 ? "" : "s"} still have a number. Live games use the first weeks when the spread is gone.`
      : "Spreads are down on the live slate. Implied points are shrunk team scores, not a book.",
    lines.length
      ? `${matched} props priced against the PrizePicks board (${lines.length} up).`
      : "PrizePicks did not answer. Power, Core, and Flex are skips — not losses.",
    `Anytime λ mixes a finish channel and an explosive channel, then P = 1 − e^(−λ). Six pseudo-games shrink a two-week TD rate back toward the league.`,
    night
      ? `${night.away} at ${night.home} is priced on its own card. Puka Nacua is out, so his routes are reseated. Mile High lifts the throws.`
      : "Rams at Broncos is not on this week’s scoreboard.",
  ];

  return {
    date,
    week,
    season,
    model: { version: RZM.version, name: RZM.name },
    games: [...games].sort((a, b) => {
      const order = { in: 0, pre: 1, post: 2 };
      return order[a.state] - order[b.state] || a.detail.localeCompare(b.detail);
    }),
    goalLine,
    props,
    slips,
    notes,
    lineCount: lines.length,
    match: night ? buildMatch(night, picks, people, playerWeeks, weather, priorWeeks) : null,
  };
}
