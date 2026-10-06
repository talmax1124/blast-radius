import { juiceFloor } from "./ev";
import type {
  Lean,
  OddsType,
  PropMarket,
  ScannerRow,
  SlipCard,
  SteamFlag,
  WireAlert,
  WireBoard,
  WireQuote,
} from "./types";

export function quoteKey(name: string, market: string, oddsType: string): string {
  return `${name.trim().toLowerCase()}|${market}|${oddsType}`;
}

export function clvPoints(side: "over" | "under", posted: number, close: number | null | undefined): number | null {
  if (close == null || !Number.isFinite(close)) return null;
  return side === "over" ? close - posted : posted - close;
}

export function steamOf(open: number | null, last: number | null, side: "over" | "under"): SteamFlag {
  if (open == null || last == null) return "flat";
  const delta = last - open;
  if (Math.abs(delta) < 0.45) return "flat";
  const ourWay = side === "over" ? delta > 0 : delta < 0;
  return ourWay ? "steam" : "fade";
}

export function formatLineMove(open: number | null, last: number | null): string {
  if (last == null) return "—";
  if (open == null || open === last) return last.toFixed(1).replace(/\.0$/, "");
  return `${open.toFixed(1).replace(/\.0$/, "")} → ${last.toFixed(1).replace(/\.0$/, "")}`;
}

export function formatClv(clv: number | null): string {
  if (clv == null) return "—";
  if (Math.abs(clv) < 0.05) return "flat";
  const signed = `${clv > 0 ? "+" : ""}${clv.toFixed(1)}`;
  return clv > 0 ? `${signed} beat` : `${signed} lost`;
}

export function formatCover(cover: number): string {
  return `${Math.round(cover * 100)}%`;
}

export function formatEdge(edge: number): string {
  const pts = Math.round(edge * 100);
  return `${pts >= 0 ? "+" : ""}${pts}`;
}

const MARKET_SHORT: Record<PropMarket, string> = {
  hr: "HR",
  hits: "H",
  tb: "TB",
  rbi: "RBI",
  sb: "SB",
  k: "Ks",
  hrrbi: "H+R+RBI",
  runs: "R",
  fs: "FS",
};

export function marketShort(market: PropMarket): string {
  return MARKET_SHORT[market];
}

export function emptyWire(): WireBoard {
  return {
    scanned: 0,
    plusEv: 0,
    steam: 0,
    fade: 0,
    clvBeats: 0,
    clvN: 0,
    alerts: [],
    rows: [],
  };
}

export function quoteMap(quotes: WireQuote[]): Map<string, WireQuote> {
  const map = new Map<string, WireQuote>();
  for (const q of quotes) map.set(q.key, q);
  return map;
}

export function cardKeys(slips: SlipCard[]): Set<string> {
  const set = new Set<string>();
  for (const slip of slips) {
    for (const leg of slip.legs) {
      set.add(`${leg.playerId}|${leg.market}`);
      set.add(quoteKey(leg.name, leg.market, leg.oddsType));
    }
  }
  return set;
}

export { juiceFloor };
export type { Lean, OddsType, ScannerRow, SteamFlag, WireAlert, WireBoard, WireQuote };
