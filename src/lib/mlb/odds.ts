import { namesMatch } from "./parse.ts";
import type { BookGame, BookProp, BooksBoard, PropMarket, ScannerRow } from "./types.ts";

export function probToAmerican(p: number): number | null {
  if (!Number.isFinite(p) || p <= 0.02 || p >= 0.98) return null;
  if (p >= 0.5) return Math.round((-100 * p) / (1 - p));
  return Math.round((100 * (1 - p)) / p);
}

export function parseAmerican(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = Number(raw.replace(/^\+/, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function americanToProb(american: number): number {
  if (!Number.isFinite(american) || american === 0) return 0;
  if (american < 0) return -american / (-american + 100);
  return 100 / (american + 100);
}

export function holdOf(over: number | null, under: number | null): number | null {
  if (over == null || under == null) return null;
  const h = americanToProb(over) + americanToProb(under) - 1;
  return Number.isFinite(h) ? h : null;
}

export function formatAmerican(american: number | null | undefined): string {
  if (american == null || !Number.isFinite(american)) return "—";
  const n = Math.round(american);
  return n > 0 ? `+${n}` : `${n}`;
}

export function formatHold(hold: number | null | undefined): string {
  if (hold == null) return "—";
  return `${(hold * 100).toFixed(1)}%`;
}

export function formatImplied(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(p)) return "—";
  return `${Math.round(p * 100)}%`;
}

export function emptyBooks(): BooksBoard {
  return { games: [], props: [], sources: [], books: 0, leaks: 0, news: [], feeds: [] };
}

export function matchBookProp(props: BookProp[], name: string, market: PropMarket, line?: number): BookProp | null {
  const pool = props.filter((p) => p.market === market && namesMatch(p.name, name));
  if (!pool.length) return null;
  if (line == null) return pool[0] ?? null;
  return [...pool].sort((a, b) => Math.abs(a.line - line) - Math.abs(b.line - line))[0] ?? null;
}

export function attachBooks(rows: ScannerRow[], props: BookProp[]): ScannerRow[] {
  return rows.map((row) => {
    const book = matchBookProp(props, row.name, row.market, row.line);
    if (!book) return row;
    const american = row.side === "under" ? book.underAmerican : book.overAmerican;
    const implied = american != null ? americanToProb(american) : book.implied;
    return {
      ...row,
      bookLine: book.line,
      bookAmerican: american,
      bookImplied: implied,
      bookSource: book.source,
    };
  });
}

export function leakOf(row: ScannerRow): boolean {
  if (row.bookLine == null) return false;
  if (row.side === "over" && row.line + 0.4 < row.bookLine) return true;
  if (row.side === "under" && row.line > row.bookLine + 0.4) return true;
  if (row.bookImplied != null && row.cover - row.bookImplied >= 0.08) return true;
  return false;
}

export function countLeaks(rows: ScannerRow[]): number {
  return rows.filter(leakOf).length;
}

export type { BookGame, BookProp, BooksBoard };
