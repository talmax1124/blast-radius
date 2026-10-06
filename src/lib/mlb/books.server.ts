import { normAbbr } from "./parks";
import { americanToProb, emptyBooks, holdOf } from "./odds";
import {
  fetchEspnBoard,
  fetchKalshiMlb,
  fetchPinnacle,
  fetchTransactions,
  fetchUnderdogMlb,
  pingFeeds,
  type GamePatch,
} from "./feeds.server";
import type { ApiSource, BookGame, BookLine, BookProp, BooksBoard, DeskNews, PropMarket } from "./types";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const BOOK_LABEL: Record<number, string> = {
  15: "Consensus",
  30: "Open",
  68: "DraftKings",
  69: "FanDuel",
  75: "BetMGM",
  71: "BetRivers",
  79: "bet365",
  123: "Caesars",
};

const KEEP_BOOKS = new Set(Object.keys(BOOK_LABEL).map(Number));

const YES_MARKET: Record<string, { market: PropMarket; line: number }> = {
  "Player to hit a Home Run": { market: "hr", line: 0.5 },
  "Player to record a Hit": { market: "hits", line: 0.5 },
  "Player to record an RBI": { market: "rbi", line: 0.5 },
  "Player to record a Run": { market: "runs", line: 0.5 },
  "Player to record a Stolen Base": { market: "sb", line: 0.5 },
};

const TITLE_MARKET: Array<{ re: RegExp; market: PropMarket }> = [
  { re: /^Total Strikeouts - (.+)$/i, market: "k" },
  { re: /^Total Hits, Runs and RBIs - (.+)$/i, market: "hrrbi" },
  { re: /^Total Bases - (.+)$/i, market: "tb" },
];

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

function am(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = Number(raw.replace(/^\+/, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function handicap(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function teamAbbr(raw: string): string {
  const u = raw.trim().toUpperCase();
  if (u === "ARIZ" || u === "ARI") return "AZ";
  return normAbbr(u);
}

function parseNamed(raw: string): { name: string; teamAbbr: string } | null {
  const m = /^(.*?)\s*\(([A-Z]{2,4})\)\s*$/.exec(raw.trim());
  if (!m) return { name: raw.trim(), teamAbbr: "" };
  return { name: m[1].trim(), teamAbbr: teamAbbr(m[2]) };
}

function lineOf(row: {
  ml_away?: number | null;
  ml_home?: number | null;
  spread_away?: number | null;
  spread_home?: number | null;
  spread_away_line?: number | null;
  spread_home_line?: number | null;
  total?: number | null;
  over?: number | null;
  under?: number | null;
}): BookLine {
  return {
    mlAway: row.ml_away ?? null,
    mlHome: row.ml_home ?? null,
    spreadAway: row.spread_away ?? null,
    spreadHome: row.spread_home ?? null,
    spreadAwayPrice: row.spread_away_line ?? null,
    spreadHomePrice: row.spread_home_line ?? null,
    total: row.total ?? null,
    over: row.over ?? null,
    under: row.under ?? null,
  };
}

async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": UA,
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json();
}

function parseAction(payload: {
  games?: Array<{
    away_team_id?: number;
    home_team_id?: number;
    start_time?: string;
    status?: string;
    num_bets?: number;
    teams?: Array<{ id?: number; abbr?: string; display_name?: string }>;
    odds?: Array<{
      book_id?: number;
      type?: string;
      ml_away?: number | null;
      ml_home?: number | null;
      spread_away?: number | null;
      spread_home?: number | null;
      spread_away_line?: number | null;
      spread_home_line?: number | null;
      total?: number | null;
      over?: number | null;
      under?: number | null;
    }>;
  }>;
}): BookGame[] {
  const out: BookGame[] = [];
  for (const game of payload.games ?? []) {
    const away = (game.teams ?? []).find((t) => t.id === game.away_team_id);
    const home = (game.teams ?? []).find((t) => t.id === game.home_team_id);
    if (!away?.abbr || !home?.abbr) continue;
    const gameOdds = (game.odds ?? []).filter((o) => o.type === "game" && KEEP_BOOKS.has(Number(o.book_id)));
    const byId = new Map(gameOdds.map((o) => [Number(o.book_id), o]));
    const consensus = byId.get(15);
    const open = byId.get(30);
    if (!consensus && !gameOdds.length) continue;
    const books = gameOdds
      .filter((o) => Number(o.book_id) !== 15 && Number(o.book_id) !== 30)
      .map((o) => ({
        id: Number(o.book_id),
        name: BOOK_LABEL[Number(o.book_id)] ?? `Book ${o.book_id}`,
        line: lineOf(o),
      }));
    const unique: typeof books = [];
    const seenBooks = new Set<string>();
    for (const b of books) {
      if (seenBooks.has(b.name)) continue;
      seenBooks.add(b.name);
      unique.push(b);
    }
    const main = lineOf(consensus ?? gameOdds[0] ?? {});
    const openLine = open ? lineOf(open) : null;
    out.push({
      awayAbbr: normAbbr(away.abbr),
      homeAbbr: normAbbr(home.abbr),
      awayName: String(away.display_name ?? away.abbr),
      homeName: String(home.display_name ?? home.abbr),
      startTime: game.start_time ?? null,
      status: game.status ?? "",
      numBets: game.num_bets ?? null,
      consensus: main,
      open: openLine,
      hold: holdOf(main.over, main.under),
      books: unique,
    });
  }
  return out;
}

type BvOutcome = {
  description?: string;
  type?: string;
  price?: { american?: string | number; handicap?: string | number };
};
type BvMarket = { description?: string; outcomes?: BvOutcome[] };
type BvGroup = { description?: string; markets?: BvMarket[] };
type BvEvent = { description?: string; displayGroups?: BvGroup[] };

function parseBovada(payload: Array<{ events?: BvEvent[] }> | BvEvent[]): BookProp[] {
  const root = Array.isArray(payload) ? payload : [];
  const events: BvEvent[] = [];
  for (const node of root) {
    if (node && typeof node === "object" && "events" in node) events.push(...((node as { events?: BvEvent[] }).events ?? []));
  }
  const props: BookProp[] = [];
  const seen = new Set<string>();

  const push = (prop: BookProp) => {
    const key = `${prop.name.toLowerCase()}|${prop.market}|${prop.line}`;
    if (seen.has(key)) return;
    seen.add(key);
    props.push(prop);
  };

  for (const event of events) {
    for (const group of event.displayGroups ?? []) {
      const gname = group.description ?? "";
      if (gname !== "Batter Props" && gname !== "Pitcher Props") continue;
      for (const market of group.markets ?? []) {
        const desc = market.description ?? "";
        const yes = YES_MARKET[desc];
        if (yes) {
          for (const o of market.outcomes ?? []) {
            const named = parseNamed(String(o.description ?? ""));
            if (!named?.name) continue;
            const american = am(o.price?.american);
            if (american == null) continue;
            push({
              name: named.name,
              teamAbbr: named.teamAbbr,
              market: yes.market,
              line: yes.line,
              overAmerican: american,
              underAmerican: null,
              implied: americanToProb(american),
              source: "Bovada",
            });
          }
          continue;
        }
        for (const rule of TITLE_MARKET) {
          const m = rule.re.exec(desc);
          if (!m) continue;
          const named = parseNamed(m[1]);
          if (!named?.name) continue;
          let over: number | null = null;
          let under: number | null = null;
          let line: number | null = null;
          for (const o of market.outcomes ?? []) {
            const h = handicap(o.price?.handicap);
            if (h != null) line = h;
            const price = am(o.price?.american);
            const t = String(o.type ?? o.description ?? "").toUpperCase();
            if (t.startsWith("O")) over = price;
            else if (t.startsWith("U")) under = price;
          }
          if (line == null || (over == null && under == null)) break;
          push({
            name: named.name,
            teamAbbr: named.teamAbbr,
            market: rule.market,
            line,
            overAmerican: over,
            underAmerican: under,
            implied: over != null ? americanToProb(over) : under != null ? 1 - americanToProb(under) : 0,
            source: "Bovada",
          });
          break;
        }
      }
    }
  }
  return props;
}

function sameGame(a: { awayAbbr: string; homeAbbr: string }, b: { awayAbbr: string; homeAbbr: string }): boolean {
  return (
    (a.awayAbbr === b.awayAbbr && a.homeAbbr === b.homeAbbr) ||
    (a.awayAbbr === b.homeAbbr && a.homeAbbr === b.awayAbbr)
  );
}

function applyPatch(games: BookGame[], patch: GamePatch): void {
  const game = games.find((g) => sameGame(g, patch));
  if (!game) return;
  if (!game.books.some((b) => b.name === patch.quote.name)) game.books.push(patch.quote);
  if (!game.open && patch.open) game.open = patch.open;
}

export async function loadBooksBoard(date: string): Promise<BooksBoard> {
  return cached(`books:${date}:v4`, 3 * 60_000, async () => {
    const sources: string[] = [];
    const used: Record<string, boolean> = {};
    let games: BookGame[] = [];
    let props: BookProp[] = [];
    let news: DeskNews[] = [];
    try {
      const an = (await fetchJson("https://api.actionnetwork.com/web/v1/scoreboard/mlb", 12000)) as Parameters<
        typeof parseAction
      >[0];
      games = parseAction(an);
      if (games.length) {
        sources.push("Action Network MLB scoreboard (Consensus, Open, DraftKings, FanDuel, BetMGM, BetRivers)");
        used.an = true;
      }
    } catch {
      /* books optional */
    }
    const extras = await Promise.allSettled([
      fetchJson(
        "https://www.bovada.lv/services/sports/event/coupon/events/A/description/baseball/mlb?lang=en",
        18000,
      ).then((bv) => parseBovada(bv as Array<{ events?: BvEvent[] }>)),
      fetchPinnacle(),
      fetchUnderdogMlb(),
      fetchEspnBoard(date),
      fetchKalshiMlb(),
      fetchTransactions(date),
    ]);
    const bv = extras[0].status === "fulfilled" ? extras[0].value : [];
    if (bv.length) {
      props.push(...bv);
      sources.push("Bovada MLB player props (HR / hits / TB / RBI / SB / Ks / H+R+RBI)");
      used.bovada = true;
    }
    const pinn = extras[1].status === "fulfilled" ? extras[1].value : [];
    if (pinn.length) {
      pinn.forEach((p) => applyPatch(games, p));
      sources.push("Pinnacle guest API — sharp moneyline and total");
      used.pinn = true;
    }
    const ud = extras[2].status === "fulfilled" ? extras[2].value : [];
    if (ud.length) {
      props.push(...ud);
      sources.push("Underdog Fantasy MLB over/unders");
      used.ud = true;
    }
    const espn = extras[3].status === "fulfilled" ? extras[3].value : [];
    if (espn.length) {
      espn.forEach((p) => applyPatch(games, p));
      sources.push("ESPN scoreboard DraftKings open/close");
      used.espn = true;
    }
    const kalshi = extras[4].status === "fulfilled" ? extras[4].value : [];
    if (kalshi.length) {
      kalshi.forEach((p) => applyPatch(games, p));
      sources.push("Kalshi MLB winner markets");
      used.kalshi = true;
    }
    news = extras[5].status === "fulfilled" ? extras[5].value : [];
    if (news.length) {
      sources.push("MLB Stats API transactions");
      used.mlb = true;
    }
    used.pp = true;
    used.savant = true;
    used.rw = true;
    used.meteo = true;
    let feeds: ApiSource[] = [];
    try {
      feeds = await pingFeeds(used);
    } catch {
      feeds = [];
    }
    if (!games.length && !props.length) return { ...emptyBooks(), news, feeds };
    const names = new Set<string>();
    for (const g of games) {
      names.add("Consensus");
      if (g.open) names.add("Open");
      for (const b of g.books) names.add(b.name);
    }
    return {
      games,
      props: props.slice(0, 220),
      sources,
      books: names.size,
      leaks: 0,
      news,
      feeds,
    };
  });
}
