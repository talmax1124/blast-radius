import type { PlayerLog } from "./workbench";

export type Condition = { metric: number; line: number; side: "over" | "under" };
export type Observation = { id: string; date: string; values: number[] };
export const SIMULATION_TRIALS = 20_000;
const numeric = (value: string | undefined) =>
  value !== undefined && /^-?\d+(\.\d+)?$/.test(value.trim()) ? Number(value) : null;

export function pairedObservations(rows: PlayerLog["rows"], conditions: Condition[]) {
  const seen = new Set<string>();
  return rows
    .flatMap((row) => {
      if (seen.has(row.id) || !Number.isFinite(Date.parse(row.date))) return [];
      seen.add(row.id);
      const values = conditions.map((c) => numeric(row.stats[c.metric]));
      return values.every((v) => v !== null && Number.isFinite(v))
        ? [{ id: row.id, date: row.date, values: values as number[] }]
        : [];
    })
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}

// Seeded Mulberry32: repeatable scenario comparisons, not cryptographic randomness.
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function wilson(successes: number, n: number): [number, number] {
  if (!Number.isInteger(n) || n < 1 || successes < 0 || successes > n)
    throw new Error("Invalid binomial sample");
  const z = 1.959963984540054,
    p = successes / n,
    d = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / d;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}
function outcome(values: number[], conditions: Condition[]) {
  const legs = conditions.map((c, i) =>
    c.side === "over" ? values[i] > c.line : values[i] < c.line,
  );
  const pushes = conditions.map((c, i) => values[i] === c.line);
  return {
    legs,
    win: legs.every(Boolean),
    push: pushes.some(Boolean) && legs.every((v, i) => v || pushes[i]),
  };
}
export function simulate(
  observations: Observation[],
  conditions: Condition[],
  tilt = 0,
  seed = 42,
  trials = SIMULATION_TRIALS,
) {
  if (
    conditions.length < 1 ||
    conditions.length > 2 ||
    observations.length < 5 ||
    !Number.isFinite(tilt) ||
    Math.abs(tilt) > 1 ||
    !Number.isInteger(seed) ||
    !Number.isInteger(trials) ||
    trials < 100 ||
    trials > 100_000 ||
    conditions.some((c) => !Number.isFinite(c.line) || !["over", "under"].includes(c.side)) ||
    observations.some(
      (o) => o.values.length !== conditions.length || o.values.some((v) => !Number.isFinite(v)),
    )
  )
    throw new Error(
      "Use 5 or more complete games, valid conditions, and bounded simulation settings.",
    );
  const n = observations.length;
  const mean = observations.reduce((sum, o) => sum + o.values[0], 0) / n;
  const sd = Math.sqrt(observations.reduce((sum, o) => sum + (o.values[0] - mean) ** 2, 0) / n);
  // Tilt resampling weights; never manufacture fractional counts or unobserved stat pairs.
  const weights = observations.map((o) =>
    Math.exp(tilt * Math.max(-3, Math.min(3, sd ? (o.values[0] - mean) / sd : 0))),
  );
  const sum = weights.reduce((a, b) => a + b, 0);
  const probabilities = weights.map((w) => w / sum);
  const outcomes = observations.map((o) => outcome(o.values, conditions));
  const exact = Math.min(
    1,
    outcomes.reduce((s, o, i) => s + (o.win ? probabilities[i] : 0), 0),
  );
  const marginals = conditions.map((_, leg) =>
    Math.min(
      1,
      outcomes.reduce((s, o, i) => s + (o.legs[leg] ? probabilities[i] : 0), 0),
    ),
  );
  const independent = marginals.reduce((a, b) => a * b, 1);
  let running = 0;
  const cdf = probabilities.map((p) => (running += p));
  cdf[n - 1] = 1;
  const rng = random(seed);
  let wins = 0,
    pushes = 0;
  const histogram = new Map<number, number>();
  for (let i = 0; i < trials; i++) {
    const u = rng();
    let lo = 0,
      hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (u < cdf[mid]) hi = mid;
      else lo = mid + 1;
    }
    wins += Number(outcomes[lo].win);
    pushes += Number(outcomes[lo].push);
    const v = observations[lo].values[0];
    histogram.set(v, (histogram.get(v) ?? 0) + 1);
  }
  const baselineWins = outcomes.filter((o) => o.win).length;
  return {
    n,
    trials,
    seed,
    tilt,
    probability: wins / trials,
    push: pushes / trials,
    loss: (trials - wins - pushes) / trials,
    exact,
    independent,
    interval: wilson(baselineWins, n),
    mcError: 1.96 * Math.sqrt((exact * (1 - exact)) / trials),
    effectiveN: 1 / probabilities.reduce((s, p) => s + p * p, 0),
    histogram: [...histogram]
      .sort((a, b) => a[0] - b[0])
      .map(([value, count]) => ({ value, probability: count / trials })),
  };
}

// Expanding-window diagnostic: each prediction uses earlier dates only.
export function walkForward(observations: Observation[], conditions: Condition[]) {
  const ordered = [...observations].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const eastern = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const dateKey = (date: string) => eastern.format(new Date(date));
  const folds: { date: string; probability: number; actual: number; training: number }[] = [];
  for (const target of ordered) {
    // Same-day games stay together to avoid using a game that was still in progress.
    const day = dateKey(target.date);
    const training = ordered.filter((o) => dateKey(o.date) < day);
    if (training.length < 5) continue;
    const wins = training.filter((o) => outcome(o.values, conditions).win).length;
    folds.push({
      date: target.date,
      probability: (wins + 1) / (training.length + 2),
      actual: Number(outcome(target.values, conditions).win),
      training: training.length,
    });
  }
  return {
    folds,
    brier: folds.length
      ? folds.reduce((s, f) => s + (f.probability - f.actual) ** 2, 0) / folds.length
      : null,
  };
}
