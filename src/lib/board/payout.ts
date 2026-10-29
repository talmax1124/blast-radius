/**
 * What a slip pays, not just how often it sweeps.
 *
 * The tables are pick'em defaults (power pays only on a sweep, flex pays on near misses).
 * Apps change them by state and by promo. Check the app before trusting the EV.
 */

export type PayMode = "power" | "flex";

/** Multiplier by number of hits. Index is hits. */
export const PAYOUTS: Record<PayMode, Partial<Record<number, number[]>>> = {
  power: {
    2: [0, 0, 3],
    3: [0, 0, 0, 5],
    4: [0, 0, 0, 0, 10],
    5: [0, 0, 0, 0, 0, 20],
    6: [0, 0, 0, 0, 0, 0, 37.5],
  },
  flex: {
    3: [0, 0, 1.25, 2.25],
    4: [0, 0, 0, 1.5, 5],
    5: [0, 0, 0, 0.4, 2, 10],
    6: [0, 0, 0, 0, 0.4, 2, 25],
  },
};

/** P(exactly k hits) for independent legs with different chances. Index is k. */
export function hitDistribution(probs: number[]): number[] {
  let dist = [1];
  for (const p of probs) {
    const next = new Array(dist.length + 1).fill(0);
    for (let k = 0; k < dist.length; k++) {
      next[k] += dist[k] * (1 - p);
      next[k + 1] += dist[k] * p;
    }
    dist = next;
  }
  return dist;
}

/** Return per unit staked. 1 is break-even. Null when the mode has no table for this size. */
export function slipReturn(probs: number[], mode: PayMode): number | null {
  const table = PAYOUTS[mode][probs.length];
  if (!table) return null;
  const dist = hitDistribution(probs);
  return dist.reduce((sum, chance, k) => sum + chance * (table[k] ?? 0), 0);
}

/** The flat per-leg chance where the slip breaks even. */
export function breakevenLeg(size: number, mode: PayMode): number | null {
  if (!PAYOUTS[mode][size]) return null;
  let lo = 0.3;
  let hi = 0.95;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    const ret = slipReturn(new Array(size).fill(mid), mode) ?? 0;
    if (ret < 1) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export type SlipPrice = {
  power: number | null;
  flex: number | null;
  /** Return with every leg cut by `stress` points. A real edge survives a modest model error. */
  stressed: number | null;
  play: PayMode | "pass";
  dist: number[];
};

export function priceSlip(probs: number[], stress = 0.03): SlipPrice {
  const power = slipReturn(probs, "power");
  const flex = slipReturn(probs, "flex");
  const best: PayMode = (flex ?? -1) > (power ?? -1) ? "flex" : "power";
  const cut = probs.map((p) => Math.max(0.01, p - stress));
  const stressed = slipReturn(cut, best);
  const play = stressed != null && stressed > 1 ? best : "pass";
  return { power, flex, stressed, play, dist: hitDistribution(probs) };
}
