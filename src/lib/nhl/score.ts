export const ICE = {
  version: "1.1",
  shrinkGames: 12,
  leagueShPct: 0.105,
} as const;

const POSITION_PRIOR = {
  F: { sog: 1.85, pts: 0.42 },
  D: { sog: 1.25, pts: 0.27 },
} as const;

export type SkaterPos = "F" | "D";

/** P(X >= k) for X ~ Poisson(lambda). */
export function pAtLeast(lambda: number, k: number): number {
  if (k <= 0) return 1;
  if (lambda <= 0) return 0;
  let term = Math.exp(-lambda);
  let below = 0;
  for (let i = 0; i < k; i++) {
    below += term;
    term *= lambda / (i + 1);
    if (below >= 1) return 0;
  }
  return Math.max(0, Math.min(1, 1 - below));
}

/** Season rate pulled toward career. Weight is gp / (gp + k). */
export function shrinkRate(season: number, career: number, gp: number, k: number = ICE.shrinkGames): number {
  if (!Number.isFinite(career) || career <= 0) return Math.max(0, season);
  const played = Math.max(0, gp);
  const w = played / (played + k);
  return w * Math.max(0, season) + (1 - w) * career;
}

export function seasonWeight(gp: number, k: number = ICE.shrinkGames): number {
  const played = Math.max(0, gp);
  return played / (played + k);
}

export function pEvent(lambda: number): number {
  return 1 - Math.exp(-Math.max(0, lambda));
}

export function projectSkater(input: {
  gp: number;
  seasonSog: number;
  careerGp: number;
  careerSog: number;
  seasonGoals: number;
  careerGoals: number;
  seasonPts: number;
  careerPts: number;
  home: boolean;
  pos: SkaterPos;
}): {
  lambdaSog: number;
  lambdaPts: number;
  shPct: number;
  pShots15: number;
  pShots25: number;
  pPoint: number;
  pGoal: number;
  weight: number;
} {
  const prior = POSITION_PRIOR[input.pos];
  const careerGp = Math.max(0, input.careerGp);
  const fill = Math.max(0, 40 - careerGp);
  const careerSogRate = (Math.max(0, input.careerSog) + prior.sog * fill) / (careerGp + fill);
  const careerPtsRate = (Math.max(0, input.careerPts) + prior.pts * fill) / (careerGp + fill);
  const seasonSogRate = input.gp > 0 ? input.seasonSog / input.gp : careerSogRate;
  const seasonPtsRate = input.gp > 0 ? input.seasonPts / input.gp : careerPtsRate;
  const venue = input.home ? 0.98 : 1.04;
  const lambdaSog = shrinkRate(seasonSogRate, careerSogRate, input.gp) * venue;
  const lambdaPts = shrinkRate(seasonPtsRate, careerPtsRate, input.gp);
  const shotsForSh = input.careerSog + input.seasonSog;
  const goalsForSh = input.careerGoals + input.seasonGoals;
  const rawSh = shotsForSh > 0 ? goalsForSh / shotsForSh : ICE.leagueShPct;
  const shPct = shrinkRate(rawSh, ICE.leagueShPct, Math.min(shotsForSh, 400), 200);
  return {
    lambdaSog,
    lambdaPts,
    shPct,
    pShots15: pAtLeast(lambdaSog, 2),
    pShots25: pAtLeast(lambdaSog, 3),
    pPoint: pEvent(lambdaPts),
    pGoal: pEvent(lambdaSog * shPct),
    weight: seasonWeight(input.gp),
  };
}

export function slipSweep(probs: number[]): number {
  return probs.reduce((p, n) => p * n, 1);
}
