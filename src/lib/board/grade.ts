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

function logit(p: number): number {
  const q = Math.min(0.999, Math.max(0.001, p));
  return Math.log(q / (1 - q));
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** Legs of evidence the model's own average is worth. A short cold run moves the number, it does not erase it. */
const MARKET_PRIOR = 12;

/**
 * Pull a market toward 50/50 after it misses its own prices.
 * The hit rate is a beta-binomial posterior centered on what the model expected,
 * and the gap is applied as a shift in log-odds. A hot market is not chased.
 */
export function adjustP(p: number, sport: Sport, market: string, legs: LedgerLeg[]): number {
  const slice = legs.filter((l) => l.sport === sport && l.market === market);
  if (!slice.length) return p;
  const hits = slice.filter((l) => l.result === "hit").length;
  const expected = slice.reduce((s, l) => s + l.p, 0) / slice.length;
  const posterior = (hits + MARKET_PRIOR * expected) / (slice.length + MARKET_PRIOR);
  if (posterior >= expected) return p;
  const shift = logit(posterior) - logit(expected);
  return Math.min(0.92, Math.max(0.08, sigmoid(logit(p) + shift)));
}

/**
 * How far the model's log-odds are trusted, by sport. 1 is face value.
 * A projection model is not a market: these start under 1 and only the ledger moves them.
 * Moneyline legs from a de-vigged price are already a market number and stay at 1.
 */
export const TRUST: Record<Sport, number> = {
  nfl: 0.85,
  nba: 0.85,
  wnba: 0.85,
  nhl: 0.85,
  mlb: 0.85,
  nwsl: 0.8,
  arg: 0.8,
  uru: 0.8,
  col: 0.8,
  tennis: 0.7,
};

/**
 * Fit the trust factor for one sport from graded legs: the MAP of
 * p' = sigmoid(t * logit(p)) under a normal prior on t. Capped at 1, so a hot run never inflates the number.
 */
export function fitTrust(legs: LedgerLeg[], prior: number, sd = 0.15): number {
  if (!legs.length) return prior;
  let best = prior;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let step = 0; step <= 80; step++) {
    const t = 0.2 + step * 0.01;
    let score = -((t - prior) ** 2) / (2 * sd * sd);
    for (const leg of legs) {
      const q = sigmoid(t * logit(leg.p));
      score += Math.log(leg.result === "hit" ? q : 1 - q);
    }
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return Math.min(1, best);
}

export function trustOf(sport: Sport, book: LedgerLeg[]): number {
  return fitTrust(
    book.filter((l) => l.sport === sport && l.market !== "ml"),
    TRUST[sport],
  );
}

function trustFor(sport: Sport, market: string, trust: number): number {
  return market === "ml" && sport !== "tennis" ? 1 : trust;
}

/**
 * Model chance after the sport trust factor and the market's own record.
 * The market gap is measured after the trust factor, so the same misses are not counted twice.
 */
export function calibrate(leg: BoardLeg, book: LedgerLeg[], trust = trustOf(leg.sport, book)): number {
  const t = trustFor(leg.sport, leg.market, trust);
  const tempered = sigmoid(t * logit(leg.p));
  const slice = book
    .filter((l) => l.sport === leg.sport && l.market === leg.market)
    .map((l) => ({ ...l, p: sigmoid(t * logit(l.p)) }));
  return adjustP(tempered, leg.sport, leg.market, slice);
}

export function applyLedger(legs: BoardLeg[], book: LedgerLeg[]): BoardLeg[] {
  const byId = new Map(book.map((l) => [l.id, l]));
  const trust = new Map<Sport, number>();
  return legs.map((leg) => {
    const prior = byId.get(leg.id);
    const settled = leg.settled ?? (prior ? prior.result : null);
    if (!trust.has(leg.sport)) trust.set(leg.sport, trustOf(leg.sport, book));
    return { ...leg, p: calibrate(leg, book, trust.get(leg.sport)), settled };
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
