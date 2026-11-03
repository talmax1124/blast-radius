import { fitTrust, noVigOver, blendMarket, TRUST } from "../board/grade.ts";
import type { BookCard } from "../slips/book.ts";

/**
 * Score the model after a slate. Hit rate alone flatters a model; these are proper scores.
 *
 * - Brier: mean squared error of the chance against 0/1. Lower is better; 0.25 is a coin flip.
 * - Log loss: punishes a confident miss hardest. Lower is better; 0.693 is a coin flip.
 * - Each is reported for the raw model, the model after the sport trust factor, the flat book hit rate
 *   (the bar any model has to clear), and, on legs with a saved price, the no-vig book and the blend.
 * A model earns its keep only when it scores better than the book on the same legs.
 */

export type ScoredLeg = { sport: string; market: string; p: number; result: "hit" | "miss"; price?: number; opposite?: number };
export type Score = { n: number; brier: number; logLoss: number };
export type Scorecard = {
  n: number;
  hits: number;
  expected: number;
  raw: Score;
  trusted: Score;
  flat: Score;
  priced: { n: number; model: Score; market: Score; blended: Score } | null;
  bins: { from: number; to: number; n: number; said: number; did: number }[];
  markets: { key: string; n: number; hits: number; expected: number }[];
};

const logit = (p: number) => Math.log(p / (1 - p));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const clip = (p: number) => Math.min(0.99, Math.max(0.01, p));

export function score(ps: number[], ys: number[]): Score {
  const n = ps.length;
  if (!n) return { n: 0, brier: NaN, logLoss: NaN };
  let b = 0;
  let l = 0;
  ps.forEach((p, i) => {
    b += (p - ys[i]) ** 2;
    const q = clip(p);
    l -= ys[i] ? Math.log(q) : Math.log(1 - q);
  });
  return { n, brier: b / n, logLoss: l / n };
}

export function bookLegs(book: BookCard[]): ScoredLeg[] {
  return book.flatMap((c) =>
    c.legs
      .filter((l) => l.model && (l.result === "hit" || l.result === "miss"))
      .map((l) => ({ sport: l.model!.sport, market: `${l.model!.sport} ${l.market}`, p: l.model!.p, result: l.result as "hit" | "miss", price: l.price, opposite: l.opposite })),
  );
}

export function scorecard(legs: ScoredLeg[]): Scorecard {
  const ys: number[] = legs.map((l) => (l.result === "hit" ? 1 : 0));
  const hits = ys.reduce((a, b) => a + b, 0);
  const trust: Record<string, number> = {};
  for (const sport of new Set(legs.map((l) => l.sport))) {
    trust[sport] = fitTrust(
      legs.filter((l) => l.sport === sport).map((l) => ({ id: "", date: "", sport: l.sport as never, market: "", marketLabel: "", name: "", prop: "", p: l.p, result: l.result })),
      TRUST[sport as keyof typeof TRUST] ?? 0.85,
    );
  }
  const trusted = legs.map((l) => sigmoid(trust[l.sport] * logit(l.p)));
  const rate = legs.length ? hits / legs.length : 0.5;

  const pricedIdx = legs.map((l, i) => (l.price != null ? i : -1)).filter((i) => i >= 0);
  const market = pricedIdx.map((i) => noVigOver(legs[i].price!, legs[i].opposite ?? null));
  const priced = pricedIdx.length
    ? {
        n: pricedIdx.length,
        model: score(pricedIdx.map((i) => legs[i].p), pricedIdx.map((i) => ys[i])),
        market: score(market, pricedIdx.map((i) => ys[i])),
        blended: score(pricedIdx.map((i, k) => blendMarket(legs[i].p, market[k])), pricedIdx.map((i) => ys[i])),
      }
    : null;

  const edges = [0, 0.6, 0.7, 0.8, 0.9, 1.0001];
  const bins = edges.slice(0, -1).map((from, k) => {
    const to = edges[k + 1];
    const idx = legs.map((l, i) => (l.p >= from && l.p < to ? i : -1)).filter((i) => i >= 0);
    return {
      from,
      to: Math.min(1, to),
      n: idx.length,
      said: idx.length ? idx.reduce((s, i) => s + legs[i].p, 0) / idx.length : NaN,
      did: idx.length ? idx.reduce((s, i) => s + ys[i], 0) / idx.length : NaN,
    };
  }).filter((b) => b.n > 0);

  const byMarket = new Map<string, { n: number; hits: number; expected: number }>();
  legs.forEach((l, i) => {
    const m = byMarket.get(l.market) ?? { n: 0, hits: 0, expected: 0 };
    m.n++;
    m.hits += ys[i];
    m.expected += l.p;
    byMarket.set(l.market, m);
  });

  return {
    n: legs.length,
    hits,
    expected: legs.reduce((s, l) => s + l.p, 0),
    raw: score(legs.map((l) => l.p), ys),
    trusted: score(trusted, ys),
    flat: score(legs.map(() => rate), ys),
    priced,
    bins,
    markets: [...byMarket].map(([key, m]) => ({ key, ...m })).sort((a, b) => b.n - a.n),
  };
}
