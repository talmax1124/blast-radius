export type KellyBet = {
  label: string;
  p: number;
  american: number;
};

export type KellyRow = KellyBet & {
  decimal: number;
  breakeven: number;
  full: number;
  half: number;
  stake: number;
};

export type GrowthPoint = {
  multiple: number;
  stake: number;
  growth: number;
};

export function toAmerican(raw: number | string): number {
  if (typeof raw === "number") return raw;
  const n = Number(raw.replace(/[−–]/g, "-").replace(/^\+/, "").trim());
  return Number.isFinite(n) ? n : 0;
}

export function decimalOdds(american: number): number {
  if (!Number.isFinite(american) || american === 0) return 1;
  return american < 0 ? 1 + 100 / -american : 1 + american / 100;
}

/** Signed Kelly fraction of bankroll. Negative means the chance does not beat the price. */
export function kellyFull(p: number, american: number): number {
  const decimal = decimalOdds(american);
  if (!(decimal > 1) || !(p > 0) || p >= 1) return 0;
  return (p * decimal - 1) / (decimal - 1);
}

export function kellyRow(bet: KellyBet): KellyRow {
  const decimal = decimalOdds(bet.american);
  const full = kellyFull(bet.p, bet.american);
  return {
    ...bet,
    decimal,
    breakeven: decimal > 1 ? 1 / decimal : 1,
    full,
    half: Math.max(0, full / 2),
    stake: Math.max(0, full),
  };
}

/** Expected log growth of one bet. Zero stake grows nothing. */
export function logGrowth(p: number, american: number, fraction: number): number {
  if (fraction <= 0) return 0;
  if (fraction >= 1) return Number.NEGATIVE_INFINITY;
  const net = decimalOdds(american) - 1;
  const win = 1 + fraction * net;
  const lose = 1 - fraction;
  if (win <= 0 || lose <= 0) return Number.NEGATIVE_INFINITY;
  return p * Math.log(win) + (1 - p) * Math.log(lose);
}

export function growthCurve(p: number, american: number): GrowthPoint[] {
  const full = Math.max(0, kellyFull(p, american));
  return [0, 0.25, 0.5, 0.75, 1, 1.5, 2].map((multiple) => {
    const stake = Math.min(0.95, full * multiple);
    return { multiple, stake, growth: logGrowth(p, american, stake) };
  });
}

export function peakGrowth(points: GrowthPoint[]): GrowthPoint {
  return points.reduce((best, point) => (point.growth > best.growth ? point : best), points[0]);
}

/** Expected log growth of simultaneous independent bets, each sized at `scale` times its own Kelly. */
export function simultaneousGrowth(bets: KellyBet[], scale: number): number {
  const parts = bets.map((bet) => ({
    p: bet.p,
    f: Math.max(0, kellyFull(bet.p, bet.american)) * scale,
    net: decimalOdds(bet.american) - 1,
  }));
  if (parts.reduce((sum, part) => sum + part.f, 0) >= 0.99) return Number.NEGATIVE_INFINITY;
  const n = parts.length;
  if (n === 0 || n > 8) return 0;
  let growth = 0;
  for (let mask = 0; mask < 2 ** n; mask++) {
    let prob = 1;
    let wealth = 1;
    for (let i = 0; i < n; i++) {
      const win = (mask & (1 << i)) !== 0;
      prob *= win ? parts[i].p : 1 - parts[i].p;
      wealth += win ? parts[i].f * parts[i].net : -parts[i].f;
    }
    if (wealth <= 0) return Number.NEGATIVE_INFINITY;
    growth += prob * Math.log(wealth);
  }
  return growth;
}

export function optimizeSimultaneous(bets: KellyBet[]): { scale: number; growth: number } {
  let best = { scale: 0, growth: 0 };
  for (let step = 0; step <= 20; step++) {
    const scale = step / 20;
    const growth = simultaneousGrowth(bets, scale);
    if (growth > best.growth) best = { scale, growth };
  }
  return best;
}

export function lift(growth: number): number {
  if (!Number.isFinite(growth)) return 0;
  return Math.exp(growth) - 1;
}

/** Room between the chance and the break-even price. Under 5 points is not sized. */
export function cushionOf(bet: KellyBet): number {
  return bet.p - 1 / decimalOdds(bet.american);
}

export function sizedBets(bets: KellyBet[], minCushion = 0.05): KellyBet[] {
  return bets.filter((bet) => cushionOf(bet) >= minCushion);
}

export type KellyRisk = {
  exposed: number;
  worstLoss: number;
  pWorst: number;
  pDown: number;
  thinnest: string;
  cushion: number;
  shock: { cut: number; growth: number }[];
  drawdownHalf: number;
  drawdownFull: number;
};

function partsAt(bets: KellyBet[], scale: number, cut = 0) {
  return bets.map((bet) => ({
    p: Math.min(0.99, Math.max(0.01, bet.p - cut)),
    f: Math.max(0, kellyFull(bet.p, bet.american)) * scale,
    net: decimalOdds(bet.american) - 1,
  }));
}

function scan(bets: KellyBet[], scale: number, cut = 0): { growth: number; pDown: number; pWorst: number; worstLoss: number } {
  const parts = partsAt(bets, scale, cut);
  const n = parts.length;
  let growth = 0;
  let pDown = 0;
  let pWorst = 0;
  let worstLoss = 0;
  for (let mask = 0; mask < 2 ** n; mask++) {
    let prob = 1;
    let wealth = 1;
    let losses = 0;
    for (let i = 0; i < n; i++) {
      const win = (mask & (1 << i)) !== 0;
      prob *= win ? parts[i].p : 1 - parts[i].p;
      wealth += win ? parts[i].f * parts[i].net : -parts[i].f;
      if (!win) losses += 1;
    }
    if (wealth <= 0) return { growth: Number.NEGATIVE_INFINITY, pDown: 1, pWorst: prob, worstLoss: 1 };
    growth += prob * Math.log(wealth);
    if (wealth < 1 - 1e-9) pDown += prob;
    if (losses === n) {
      pWorst += prob;
      worstLoss = 1 - wealth;
    }
  }
  return { growth, pDown, pWorst, worstLoss };
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Share of paths that touch a 25% drawdown across repeated independent slates. */
export function drawdownRate(bets: KellyBet[], scale: number, slates = 20, paths = 2000, seed = 7): number {
  const parts = partsAt(bets, scale);
  const rng = mulberry32(seed);
  let hit = 0;
  for (let path = 0; path < paths; path++) {
    let wealth = 1;
    for (let slate = 0; slate < slates; slate++) {
      for (const part of parts) wealth += rng() < part.p ? part.f * part.net : -part.f;
      if (wealth <= 0.75) {
        hit += 1;
        break;
      }
    }
  }
  return hit / paths;
}

export function kellyRisk(bets: KellyBet[]): KellyRisk {
  const rows = bets.map((bet) => ({ label: bet.label, cushion: bet.p - (1 / decimalOdds(bet.american)) }));
  const thin = rows.reduce((worst, row) => (row.cushion < worst.cushion ? row : worst), rows[0]);
  const half = scan(bets, 0.5);
  const shock = [0, 0.03, 0.05, 0.08].map((cut) => ({ cut, growth: scan(bets, 0.5, cut).growth }));
  return {
    exposed: bets.reduce((sum, bet) => sum + Math.max(0, kellyFull(bet.p, bet.american) / 2), 0),
    worstLoss: half.worstLoss,
    pWorst: half.pWorst,
    pDown: half.pDown,
    thinnest: thin?.label ?? "",
    cushion: thin?.cushion ?? 0,
    shock,
    drawdownHalf: drawdownRate(bets, 0.5),
    drawdownFull: drawdownRate(bets, 1),
  };
}
