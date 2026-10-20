/**
 * Touch Rate. A soccer shot prop is starts times a per-start rate.
 * Club splits only. Internationals do not count. Zero starts is not a prior
 * dressed up as a shot over. The cash number is the line we would buy.
 */

export type Pos = "F" | "M" | "D";

export const PITCH = {
  version: "1.0",
  name: "Touch Rate",
  shrinkStarts: 8,
  quiet: 0.75,
  minAfter: 0.55,
  minStarts: 3,
} as const;

const PRIOR: Record<Pos, { shots: number; sot: number; goals: number }> = {
  F: { shots: 3.1, sot: 1.15, goals: 0.38 },
  M: { shots: 1.55, sot: 0.5, goals: 0.1 },
  D: { shots: 0.55, sot: 0.16, goals: 0.03 },
};

export function posOf(abbr: string): Pos | null {
  const a = abbr.toUpperCase();
  if (a === "F" || a === "FW" || a === "ST" || a === "CF") return "F";
  if (a === "M" || a === "MF" || a === "AM" || a === "CM" || a === "DM") return "M";
  if (a === "D" || a === "DF" || a === "CB" || a === "FB" || a === "WB") return "D";
  return null;
}

export function shrink(rate: number, prior: number, starts: number, k: number = PITCH.shrinkStarts): number {
  const n = Math.max(0, starts);
  const w = n / (n + k);
  return w * Math.max(0, rate) + (1 - w) * Math.max(0, prior);
}

/** P(X >= k) for a Poisson count. */
export function pAtLeast(lambda: number, k: number): number {
  if (!(lambda > 0)) return k <= 0 ? 1 : 0;
  let term = Math.exp(-lambda);
  let sum = term;
  for (let i = 1; i < k; i++) {
    term *= lambda / i;
    sum += term;
  }
  return Math.min(0.99, Math.max(0.01, 1 - sum));
}

export function projectPlayer(input: { pos: Pos; starts: number; shots: number; sot: number; goals: number }): {
  shots: number;
  sot: number;
  goals: number;
  pShots15: number;
  pSot05: number;
  pGoal: number;
  cashShots: number | null;
} {
  const prior = PRIOR[input.pos];
  const starts = Math.max(0, input.starts);
  const per = (total: number, base: number) => (starts > 0 ? total / starts : base);
  const shots = shrink(per(input.shots, prior.shots), prior.shots, starts);
  const sot = shrink(per(input.sot, prior.sot), prior.sot, starts);
  const goals = shrink(per(input.goals, prior.goals), prior.goals, starts);
  const quiet = shots * PITCH.quiet;
  const cashShots = starts >= PITCH.minStarts && pAtLeast(quiet, 2) >= PITCH.minAfter ? 1.5 : null;
  return {
    shots,
    sot,
    goals,
    pShots15: pAtLeast(shots, 2),
    pSot05: pAtLeast(sot, 1),
    pGoal: pAtLeast(goals, 1),
    cashShots,
  };
}

export type CardLeg = {
  id: string;
  name: string;
  team: string;
  gameId: string;
  line: number;
  projection: number;
  cover: number;
};

export function buildCard(
  rows: { id: string; name: string; team: string; gameId: string; starts: number; shots: number; cover: number; cash: number | null }[],
): CardLeg[] {
  const legs: CardLeg[] = [];
  const games = new Set<string>();
  const ranked = rows
    .filter((row) => row.cash != null && row.starts >= PITCH.minStarts)
    .sort((a, b) => b.cover - a.cover || b.shots - a.shots);
  for (const row of ranked) {
    if (legs.length === 3) break;
    if (games.has(row.gameId)) continue;
    games.add(row.gameId);
    legs.push({
      id: row.id,
      name: row.name,
      team: row.team,
      gameId: row.gameId,
      line: row.cash ?? 1.5,
      projection: row.shots,
      cover: row.cover,
    });
  }
  return legs;
}
