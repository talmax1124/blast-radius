import type { BoardLeg, LedgerLeg, Sport } from "./types";

export type MarketLine = {
  key: string;
  sport: Sport;
  market: string;
  label: string;
  n: number;
  hits: number;
  expected: number;
};

export type Bucket = {
  label: string;
  lo: number;
  hi: number;
  n: number;
  hits: number;
  expected: number;
};

export type BookReport = {
  n: number;
  hits: number;
  expected: number;
  brier: number | null;
  byMarket: MarketLine[];
  buckets: Bucket[];
  lines: string[];
};

const BUCKETS: { label: string; lo: number; hi: number }[] = [
  { label: "50–60", lo: 0.5, hi: 0.6 },
  { label: "60–70", lo: 0.6, hi: 0.7 },
  { label: "70–80", lo: 0.7, hi: 0.8 },
  { label: "80+", lo: 0.8, hi: 1.01 },
];

export function reportOf(legs: LedgerLeg[]): BookReport {
  const n = legs.length;
  const hits = legs.filter((l) => l.result === "hit").length;
  const expected = legs.reduce((s, l) => s + l.p, 0);
  let brier: number | null = null;
  if (n > 0) {
    const sse = legs.reduce((s, l) => {
      const y = l.result === "hit" ? 1 : 0;
      return s + (l.p - y) ** 2;
    }, 0);
    brier = sse / n;
  }
  const groups = new Map<string, MarketLine>();
  for (const leg of legs) {
    const key = `${leg.sport}:${leg.market}`;
    const row = groups.get(key) ?? {
      key,
      sport: leg.sport,
      market: leg.market,
      label: leg.marketLabel,
      n: 0,
      hits: 0,
      expected: 0,
    };
    row.n += 1;
    row.hits += leg.result === "hit" ? 1 : 0;
    row.expected += leg.p;
    groups.set(key, row);
  }
  const byMarket = [...groups.values()].sort((a, b) => b.n - a.n);
  const buckets = BUCKETS.map((b) => {
    const slice = legs.filter((l) => l.p >= b.lo && l.p < b.hi);
    return {
      ...b,
      n: slice.length,
      hits: slice.filter((l) => l.result === "hit").length,
      expected: slice.reduce((s, l) => s + l.p, 0),
    };
  });
  return { n, hits, expected, brier, byMarket, buckets, lines: narrate({ n, hits, expected, byMarket, buckets }) };
}

function narrate(report: {
  n: number;
  hits: number;
  expected: number;
  byMarket: MarketLine[];
  buckets: Bucket[];
}): string[] {
  if (report.n === 0) {
    return ["No graded legs yet. Mark a result when the game ends. The desk will not invent one."];
  }
  const gap = report.hits - report.expected;
  const lines = [
    `${report.hits} of ${report.n} graded legs hit. The model expected ${report.expected.toFixed(1)}.`,
  ];
  if (gap < -1) lines.push("The card is running cold against its own numbers. Probabilities on the weak markets are pulled in.");
  else if (gap > 1) lines.push("The card is running hot. That does not raise tomorrow’s number.");
  else lines.push("Hits and expected hits are close. The prices are allowed to stand.");
  const leak = report.byMarket.filter((m) => m.n >= 4).sort((a, b) => a.hits - a.expected - (b.hits - b.expected))[0];
  if (leak && leak.hits + 0.8 < leak.expected) {
    lines.push(
      `${leak.sport.toUpperCase()} ${leak.label} is the leak: ${leak.hits} of ${leak.n}, expected ${leak.expected.toFixed(1)}.`,
    );
  }
  const hold = report.byMarket.filter((m) => m.n >= 4).sort((a, b) => Math.abs(a.hits - a.expected) - Math.abs(b.hits - b.expected))[0];
  if (hold && Math.abs(hold.hits - hold.expected) < 0.6) {
    lines.push(`${hold.sport.toUpperCase()} ${hold.label} is calibrated: ${hold.hits} of ${hold.n}, expected ${hold.expected.toFixed(1)}.`);
  }
  return lines;
}

/** Pull a market toward 50/50 after it misses its own prices. A hot market is not chased. */
export function adjustP(p: number, sport: Sport, market: string, legs: LedgerLeg[]): number {
  const slice = legs.filter((l) => l.sport === sport && l.market === market);
  if (slice.length < 6) return p;
  const hits = slice.filter((l) => l.result === "hit").length;
  const expected = slice.reduce((s, l) => s + l.p, 0);
  const gap = hits / slice.length - expected / slice.length;
  if (gap >= -0.08) return p;
  return Math.min(0.92, Math.max(0.5, p * 0.7 + 0.5 * 0.3));
}

export function applyLedger(legs: BoardLeg[], book: LedgerLeg[]): BoardLeg[] {
  const byId = new Map(book.map((l) => [l.id, l]));
  return legs.map((leg) => {
    const prior = byId.get(leg.id);
    const settled = leg.settled ?? (prior ? prior.result : null);
    return { ...leg, p: adjustP(leg.p, leg.sport, leg.market, book), settled };
  });
}

export function toLedger(leg: BoardLeg, result: "hit" | "miss"): LedgerLeg {
  return {
    id: leg.id,
    date: leg.date,
    sport: leg.sport,
    market: leg.market,
    marketLabel: leg.marketLabel,
    name: leg.name,
    prop: leg.prop,
    p: leg.p,
    result,
  };
}
