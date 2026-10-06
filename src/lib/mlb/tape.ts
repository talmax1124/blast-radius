import { formatAmerican } from "./odds";
import type { BooksBoard, OddsQuote, OddsTick, SteamFlag, TapeAlert, TapeBoard, TapeGame } from "./types";
import { marketShort } from "./wire";

export function emptyTape(): TapeBoard {
  return {
    scanned: 0,
    steam: 0,
    rlm: 0,
    movers: 0,
    ticks: 0,
    alerts: [],
    games: [],
    props: [],
  };
}

export function gameTapeId(away: string, home: string): string {
  return `${away}@${home}`;
}

export function oddsKey(kind: "game" | "prop", book: string, market: string, id: string): string {
  return `${kind}|${id}|${book}|${market}`;
}

export function mlDelta(open: number | null | undefined, last: number | null | undefined): number | null {
  if (open == null || last == null || !Number.isFinite(open) || !Number.isFinite(last)) return null;
  return last - open;
}

export function lineDelta(open: number | null | undefined, last: number | null | undefined): number | null {
  return mlDelta(open, last);
}

/** Favorite juice: more negative last than open is steam. Favorite getting shorter is RLM. */
export function mlSteam(open: number | null, last: number | null): SteamFlag {
  const d = mlDelta(open, last);
  if (d == null || Math.abs(d) < 15) return "flat";
  return d < 0 ? "steam" : "fade";
}

export function isRlm(openFav: number | null, lastFav: number | null): boolean {
  const d = mlDelta(openFav, lastFav);
  return d != null && d >= 15;
}

export function totalSteam(open: number | null, last: number | null): SteamFlag {
  const d = lineDelta(open, last);
  if (d == null || Math.abs(d) < 0.45) return "flat";
  return d > 0 ? "steam" : "fade";
}

export function propSteam(open: number | null, last: number | null): SteamFlag {
  const d = mlDelta(open, last);
  if (d == null || Math.abs(d) < 20) return "flat";
  return d < 0 ? "steam" : "fade";
}

export function formatMlMove(open: number | null | undefined, last: number | null | undefined): string {
  if (last == null) return "—";
  if (open == null || open === last) return formatAmerican(last);
  return `${formatAmerican(open)} → ${formatAmerican(last)}`;
}

export function formatTotMove(open: number | null | undefined, last: number | null | undefined): string {
  if (last == null) return "—";
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  if (open == null || open === last) return fmt(last);
  return `${fmt(open)} → ${fmt(last)}`;
}

export function formatCents(delta: number | null | undefined): string {
  if (delta == null || !Number.isFinite(delta) || Math.abs(delta) < 0.5) return "flat";
  const n = Math.round(delta);
  return n > 0 ? `+${n}¢` : `${n}¢`;
}

export function oddsMarketLabel(market: string): string {
  switch (market) {
    case "ml_home":
      return "Home ML";
    case "ml_away":
      return "Away ML";
    case "total":
      return "Total";
    case "over":
      return "Over";
    case "under":
      return "Under";
    case "spread_home":
      return "Home spr";
    case "spread_away":
      return "Away spr";
    case "hr":
    case "hits":
    case "tb":
    case "rbi":
    case "sb":
    case "k":
    case "hrrbi":
    case "runs":
    case "fs":
      return marketShort(market);
    default:
      return market;
  }
}

export function sparkValues(path: OddsTick[], field: "price" | "line"): number[] {
  return path.map((t) => (field === "price" ? t.price : t.line)).filter((n): n is number => n != null && Number.isFinite(n));
}

export function quoteBy(quotes: OddsQuote[], book: string, market: string): OddsQuote | undefined {
  return quotes.find((q) => q.book === book && q.market === market);
}

function favSide(mlAway: number | null, mlHome: number | null): "home" | "away" | null {
  if (mlAway == null || mlHome == null) return null;
  if (mlHome === mlAway) return null;
  return mlHome < mlAway ? "home" : "away";
}

function synthPath(open: number | null, last: number | null, field: "price" | "line"): OddsTick[] {
  if (open == null && last == null) return [];
  if (open == null || open === last) return last == null ? [] : [{ at: "", line: field === "line" ? last : null, price: field === "price" ? last : null }];
  return [
    { at: "open", line: field === "line" ? open : null, price: field === "price" ? open : null },
    { at: "last", line: field === "line" ? last : null, price: field === "price" ? last : null },
  ];
}

export function buildTape(quotes: OddsQuote[], board: BooksBoard, ticks: number): TapeBoard {
  const games: TapeGame[] = [];
  const byGame = new Map<string, OddsQuote[]>();
  for (const q of quotes) {
    if (q.kind !== "game") continue;
    const id = gameTapeId(q.awayAbbr, q.homeAbbr);
    const list = byGame.get(id) ?? [];
    list.push(q);
    byGame.set(id, list);
  }

  for (const game of board.games) {
    const id = gameTapeId(game.awayAbbr, game.homeAbbr);
    const flipped = gameTapeId(game.homeAbbr, game.awayAbbr);
    const list = byGame.get(id) ?? byGame.get(flipped) ?? [];
    const cons = list.filter((q) => q.book === "Consensus");
    const mlHome = quoteBy(cons, "Consensus", "ml_home");
    const mlAway = quoteBy(cons, "Consensus", "ml_away");
    const total = quoteBy(cons, "Consensus", "total");
    const openHome = mlHome?.openPrice ?? game.open?.mlHome ?? null;
    const lastHome = mlHome?.lastPrice ?? game.consensus.mlHome;
    const openAway = mlAway?.openPrice ?? game.open?.mlAway ?? null;
    const lastAway = mlAway?.lastPrice ?? game.consensus.mlAway;
    const openTot = total?.openLine ?? game.open?.total ?? null;
    const lastTot = total?.lastLine ?? game.consensus.total;
    const fav = favSide(lastAway, lastHome);
    const favOpen = fav === "home" ? openHome : fav === "away" ? openAway : null;
    const favLast = fav === "home" ? lastHome : fav === "away" ? lastAway : null;
    const steam = mlSteam(favOpen, favLast);
    const rlm = isRlm(favOpen, favLast);
    const totFlag = totalSteam(openTot, lastTot);
    const books = game.books.map((b) => {
      const bHome = list.find((q) => q.book === b.name && q.market === "ml_home");
      const bTot = list.find((q) => q.book === b.name && q.market === "total");
      return {
        name: b.name,
        mlHome: bHome?.lastPrice ?? b.line.mlHome,
        total: bTot?.lastLine ?? b.line.total,
        mlDelta: mlDelta(bHome?.openPrice ?? null, bHome?.lastPrice ?? null),
      };
    });
    const path =
      mlHome && mlHome.path.length >= 2
        ? mlHome.path
        : total && total.path.length >= 2
          ? total.path
          : synthPath(openHome, lastHome, "price");
    games.push({
      awayAbbr: game.awayAbbr,
      homeAbbr: game.homeAbbr,
      startTime: game.startTime,
      status: game.status,
      openMlHome: openHome,
      lastMlHome: lastHome,
      closeMlHome: mlHome?.closePrice ?? null,
      openMlAway: openAway,
      lastMlAway: lastAway,
      closeMlAway: mlAway?.closePrice ?? null,
      openTotal: openTot,
      lastTotal: lastTot,
      closeTotal: total?.closeLine ?? null,
      mlDelta: mlDelta(openHome, lastHome),
      totalDelta: mlDelta(openTot, lastTot),
      rlm,
      steam,
      totalSteam: totFlag,
      path,
      books,
    });
  }

  games.sort((a, b) => Math.abs(b.mlDelta ?? 0) - Math.abs(a.mlDelta ?? 0) || Math.abs(b.totalDelta ?? 0) - Math.abs(a.totalDelta ?? 0));

  const props = quotes
    .filter((q) => q.kind === "prop")
    .filter((q) => propSteam(q.openPrice, q.lastPrice) !== "flat" || (q.path.length >= 2 && q.openPrice !== q.lastPrice))
    .sort((a, b) => Math.abs(mlDelta(b.openPrice, b.lastPrice) ?? 0) - Math.abs(mlDelta(a.openPrice, a.lastPrice) ?? 0))
    .slice(0, 24);

  const steamN = games.filter((g) => g.steam === "steam").length;
  const rlmN = games.filter((g) => g.rlm).length;
  const totN = games.filter((g) => g.totalSteam !== "flat").length;
  const movers = steamN + rlmN + totN + props.length;

  const alerts: TapeAlert[] = [];
  for (const g of games) {
    if (alerts.length >= 8) break;
    if (g.rlm) {
      alerts.push({
        kind: "rlm",
        headline: `${g.awayAbbr} @ ${g.homeAbbr} reverse line`,
        detail: `Home ML ${g.openMlHome ?? "—"} → ${g.lastMlHome ?? "—"}. Favorite got shorter.`,
        awayAbbr: g.awayAbbr,
        homeAbbr: g.homeAbbr,
      });
      continue;
    }
    if (g.steam === "steam") {
      alerts.push({
        kind: "steam",
        headline: `${g.awayAbbr} @ ${g.homeAbbr} steamed`,
        detail: `Home ML ${g.openMlHome ?? "—"} → ${g.lastMlHome ?? "—"}. Favorite juiced.`,
        awayAbbr: g.awayAbbr,
        homeAbbr: g.homeAbbr,
      });
      continue;
    }
    if (g.totalSteam !== "flat" && g.totalDelta != null) {
      alerts.push({
        kind: "total",
        headline: `${g.awayAbbr} @ ${g.homeAbbr} total ${g.totalDelta > 0 ? "up" : "down"}`,
        detail: `Total ${g.openTotal ?? "—"} → ${g.lastTotal ?? "—"}.`,
        awayAbbr: g.awayAbbr,
        homeAbbr: g.homeAbbr,
      });
    }
  }
  for (const p of props) {
    if (alerts.length >= 8) break;
    const d = mlDelta(p.openPrice, p.lastPrice);
    if (d == null) continue;
    alerts.push({
      kind: "prop",
      headline: `${p.name} ${p.market.replace(/_over|_under/g, "")} ${d < 0 ? "juiced" : "drifted"}`,
      detail: `${p.book} ${p.openPrice ?? "—"} → ${p.lastPrice ?? "—"} · line ${p.openLine ?? p.lastLine ?? "—"}.`,
    });
  }

  if (!games.length && !quotes.length) return emptyTape();
  return {
    scanned: games.length,
    steam: steamN,
    rlm: rlmN,
    movers,
    ticks,
    alerts,
    games,
    props,
  };
}

export { formatAmerican };
export type { OddsQuote, OddsTick, SteamFlag, TapeBoard };
