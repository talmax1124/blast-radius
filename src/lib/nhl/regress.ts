import { pAtLeast, pEvent } from "./score.ts";

/**
 * Logistic cash gate. Fit by hand to the Oct 11 miss, not to a season of data.
 * Carolina won 4-1 and the three legs still lost:
 * Blake assist 0 (he had 4 shots), Svechnikov 1 shot on a back-to-back,
 * Chychrun did not score. Aho's point cashed. A goal price is not a cash leg.
 */
const MARKET = { shot: 0, point: 0.15, assist: -0.9, goal: -1.6 } as const;

export type CashMarket = keyof typeof MARKET;

export function cashLogit(input: {
  market: CashMarket;
  lambda: number;
  line: number;
  b2b?: boolean;
}): number {
  const k = input.market === "shot" ? input.line + 0.5 : input.market === "point" ? 0.45 : 1;
  const cushion = input.lambda - k;
  const rest = input.b2b ? (input.market === "point" ? -0.35 : -0.55) : 0;
  return -0.15 + 1.35 * cushion + MARKET[input.market] + rest;
}

export function cashProb(logit: number): number {
  return 1 / (1 + Math.exp(-logit));
}

export function clearsCashGate(input: {
  market: CashMarket;
  lambda: number;
  line: number;
  b2b?: boolean;
  min?: number;
}): boolean {
  return cashProb(cashLogit(input)) >= (input.min ?? 0.62);
}

export function legProbability(market: CashMarket, lambda: number, line: number): number {
  if (market === "shot") return pAtLeast(lambda, line + 0.5);
  if (market === "point") return pEvent(lambda);
  if (market === "goal") return pEvent(lambda);
  return pEvent(lambda);
}
