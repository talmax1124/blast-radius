import { getSql } from "@/lib/db";
import { buildTape, emptyTape, gameTapeId, oddsKey } from "./tape";
import type { BookGame, BookLine, BooksBoard, GameCard, OddsQuote, OddsTick, TapeBoard } from "./types";

const PATH_CAP = 18;
const MORNING = "T14:00:00.000Z";

type Stored = { quotes: unknown; ticks: number };

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

type Print = {
  kind: "game" | "prop";
  book: string;
  market: string;
  awayAbbr: string;
  homeAbbr: string;
  name: string;
  teamAbbr: string;
  line: number | null;
  price: number | null;
  openLine: number | null;
  openPrice: number | null;
};

function pushGame(out: Print[], game: BookGame, book: string, line: BookLine, open: BookLine | null): void {
  const base = {
    kind: "game" as const,
    book,
    awayAbbr: game.awayAbbr,
    homeAbbr: game.homeAbbr,
    name: "",
    teamAbbr: "",
  };
  if (line.mlAway != null) {
    out.push({ ...base, market: "ml_away", line: null, price: line.mlAway, openLine: null, openPrice: open?.mlAway ?? null });
  }
  if (line.mlHome != null) {
    out.push({ ...base, market: "ml_home", line: null, price: line.mlHome, openLine: null, openPrice: open?.mlHome ?? null });
  }
  if (line.total != null) {
    out.push({
      ...base,
      market: "total",
      line: line.total,
      price: line.over,
      openLine: open?.total ?? null,
      openPrice: open?.over ?? null,
    });
  }
  if (line.over != null) {
    out.push({
      ...base,
      market: "over",
      line: line.total,
      price: line.over,
      openLine: open?.total ?? null,
      openPrice: open?.over ?? null,
    });
  }
  if (line.under != null) {
    out.push({
      ...base,
      market: "under",
      line: line.total,
      price: line.under,
      openLine: open?.total ?? null,
      openPrice: open?.under ?? null,
    });
  }
  if (line.spreadHome != null) {
    out.push({
      ...base,
      market: "spread_home",
      line: line.spreadHome,
      price: line.spreadHomePrice,
      openLine: open?.spreadHome ?? null,
      openPrice: open?.spreadHomePrice ?? null,
    });
  }
  if (line.spreadAway != null) {
    out.push({
      ...base,
      market: "spread_away",
      line: line.spreadAway,
      price: line.spreadAwayPrice,
      openLine: open?.spreadAway ?? null,
      openPrice: open?.spreadAwayPrice ?? null,
    });
  }
}

function flatten(board: BooksBoard): Print[] {
  const out: Print[] = [];
  for (const game of board.games) {
    pushGame(out, game, "Consensus", game.consensus, game.open);
    for (const book of game.books) {
      pushGame(out, game, book.name, book.line, game.open);
    }
  }
  for (const prop of board.props) {
    const id = prop.name.trim().toLowerCase();
    if (!id) continue;
    const base = {
      kind: "prop" as const,
      book: prop.source,
      awayAbbr: "",
      homeAbbr: "",
      name: prop.name,
      teamAbbr: prop.teamAbbr,
      openLine: null as number | null,
      openPrice: null as number | null,
    };
    if (prop.overAmerican != null) {
      out.push({ ...base, market: `${prop.market}_over`, line: prop.line, price: prop.overAmerican });
    }
    if (prop.underAmerican != null) {
      out.push({ ...base, market: `${prop.market}_under`, line: prop.line, price: prop.underAmerican });
    }
  }
  return out.slice(0, 480);
}

function printId(print: Print): string {
  return print.kind === "game" ? gameTapeId(print.awayAbbr, print.homeAbbr) : print.name.trim().toLowerCase();
}

function startedSet(games: Array<Pick<GameCard, "away" | "home" | "abstractState">>): Set<string> {
  const set = new Set<string>();
  for (const g of games) {
    if (g.abstractState === "Preview") continue;
    set.add(gameTapeId(g.away.abbr, g.home.abbr));
    set.add(gameTapeId(g.home.abbr, g.away.abbr));
  }
  return set;
}

function capPath(path: OddsTick[]): OddsTick[] {
  return path.length > PATH_CAP ? path.slice(path.length - PATH_CAP) : path;
}

function mergeQuote(prev: OddsQuote | undefined, print: Print, now: string, date: string, closed: boolean): OddsQuote {
  const key = oddsKey(print.kind, print.book, print.market, printId(print));
  if (!prev) {
    const openPrice = print.openPrice ?? print.price;
    const openLine = print.openLine ?? print.line;
    const path: OddsTick[] = [];
    if ((openPrice != null && openPrice !== print.price) || (openLine != null && openLine !== print.line)) {
      path.push({ at: `${date}${MORNING}`, line: openLine, price: openPrice });
    }
    path.push({ at: now, line: print.line, price: print.price });
    return {
      key,
      kind: print.kind,
      book: print.book,
      market: print.market,
      awayAbbr: print.awayAbbr,
      homeAbbr: print.homeAbbr,
      name: print.name,
      teamAbbr: print.teamAbbr,
      openLine,
      lastLine: print.line,
      closeLine: closed ? print.line : null,
      openPrice,
      lastPrice: print.price,
      prevPrice: null,
      closePrice: closed ? print.price : null,
      ticks: 1,
      path: capPath(path),
    };
  }
  if (prev.closePrice != null) return prev;
  const changed = prev.lastPrice !== print.price || prev.lastLine !== print.line;
  const path = changed ? capPath([...prev.path, { at: now, line: print.line, price: print.price }]) : prev.path;
  return {
    ...prev,
    lastLine: print.line,
    lastPrice: print.price,
    prevPrice: changed ? prev.lastPrice : prev.prevPrice,
    ticks: changed ? prev.ticks + 1 : prev.ticks,
    path,
    teamAbbr: print.teamAbbr || prev.teamAbbr,
    closeLine: closed ? print.line : null,
    closePrice: closed ? print.price : null,
  };
}

export async function loadOdds(date: string): Promise<{ quotes: OddsQuote[]; ticks: number }> {
  const sql = await getSql();
  const rows = await sql<Stored>`
    select quotes, ticks from desk_odds where odds_date = ${date}::date
  `;
  const quotes = parseJson<OddsQuote[]>(rows[0]?.quotes, []);
  return { quotes: Array.isArray(quotes) ? quotes : [], ticks: Number(rows[0]?.ticks) || 0 };
}

export async function snapshotOdds(
  date: string,
  board: BooksBoard,
  games: Array<Pick<GameCard, "away" | "home" | "abstractState">>,
): Promise<TapeBoard> {
  const existing = await loadOdds(date).catch(() => ({ quotes: [] as OddsQuote[], ticks: 0 }));
  const prints = flatten(board);
  if (!prints.length && !existing.quotes.length) return emptyTape();

  const now = new Date().toISOString();
  const started = startedSet(games);
  const byKey = new Map(existing.quotes.map((q) => [q.key, q]));
  const dayTicks = existing.ticks + (prints.length ? 1 : 0);

  for (const print of prints) {
    const key = oddsKey(print.kind, print.book, print.market, printId(print));
    const prev = byKey.get(key);
    const closed = print.kind === "game" && started.has(gameTapeId(print.awayAbbr, print.homeAbbr));
    byKey.set(key, mergeQuote(prev, print, now, date, closed));
  }

  const quotes = [...byKey.values()];
  const sql = await getSql();
  const json = JSON.stringify(quotes);
  await sql`
    insert into desk_odds (odds_date, quotes, ticks, updated_at)
    values (${date}::date, ${json}::jsonb, ${dayTicks}, now())
    on conflict (odds_date) do update set
      quotes = excluded.quotes,
      ticks = excluded.ticks,
      updated_at = now()
  `;
  return buildTape(quotes, board, dayTicks);
}
