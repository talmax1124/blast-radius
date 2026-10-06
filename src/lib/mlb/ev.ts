import {
  clampProb,
  expectedReturn,
  kindOf,
  payoutReturn,
  type SlipKind,
} from "./grade.ts";
import type { OddsType, PropMarket, SlipCard, SlipLeg } from "./types.ts";

export type EvSize = "pass" | "half" | "full" | "max";

export type EvLeg = {
  playerId: number;
  name: string;
  teamAbbr: string;
  opponentAbbr: string;
  market: PropMarket;
  side: "over" | "under";
  oddsType: OddsType;
  cover: number;
  gamePk?: number;
};

export type LegContrib = {
  playerId: number;
  name: string;
  market: PropMarket;
  cover: number;
  delta: number;
};

export type SlipEv = {
  kind: SlipKind;
  n: number;
  independent: number;
  correlated: number;
  breakEven: number;
  meanCover: number;
  edge: number;
  kelly: number;
  quarterKelly: number;
  size: EvSize;
  altKind: SlipKind;
  altReturn: number;
  stacks: { team: string; n: number }[];
  contrib: LegContrib[];
};

const COUNTING: Set<PropMarket> = new Set(["hrrbi", "fs", "runs", "rbi"]);
const DAMAGE: Set<PropMarket> = new Set(["hr", "hits", "tb"]);
const SIMS = 3200;

export function juiceFloor(odds: OddsType): number {
  if (odds === "demon") return 0.58;
  if (odds === "goblin") return 0.4;
  return 0.5;
}

export function breakEvenCover(kind: SlipKind, n: number): number {
  if (n <= 1) return 0.5;
  let lo = 0.02;
  let hi = 0.98;
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    const ev = expectedReturn(kind, Array.from({ length: n }, () => mid));
    if (ev >= 1) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

export function sameGame(a: EvLeg, b: EvLeg): boolean {
  if (a.playerId === b.playerId) return true;
  if (a.gamePk && b.gamePk) return a.gamePk === b.gamePk;
  return (
    a.teamAbbr === b.teamAbbr ||
    a.teamAbbr === b.opponentAbbr ||
    a.opponentAbbr === b.teamAbbr
  );
}

export function pairRho(a: EvLeg, b: EvLeg): number {
  if (a.playerId === b.playerId) return 0.34;
  if (!sameGame(a, b)) return 0;
  const sameTeam = a.teamAbbr === b.teamAbbr;
  const aCount = COUNTING.has(a.market);
  const bCount = COUNTING.has(b.market);
  const aDmg = DAMAGE.has(a.market);
  const bDmg = DAMAGE.has(b.market);
  const aK = a.market === "k";
  const bK = b.market === "k";
  const sameSide = a.side === b.side;
  let rho = 0.05;
  if (aK && bK) rho = 0.04;
  else if ((aK && (bCount || bDmg)) || (bK && (aCount || aDmg))) {
    const kVsOpp = aK ? a.teamAbbr !== b.teamAbbr : b.teamAbbr !== a.teamAbbr;
    rho = kVsOpp ? (sameSide ? -0.14 : 0.08) : sameSide ? 0.06 : -0.04;
  } else if (sameTeam && aCount && bCount) rho = 0.24;
  else if (sameTeam && aDmg && bDmg) rho = 0.18;
  else if (sameTeam && ((aCount && aDmg) || (bCount && bDmg) || (aCount && bDmg) || (aDmg && bCount))) rho = 0.14;
  else if (!sameTeam && aCount && bCount) rho = -0.12;
  else if (!sameTeam && aDmg && bDmg) rho = -0.08;
  else if (a.market === "sb" || b.market === "sb") rho = sameTeam ? 0.08 : 0.03;
  return Math.max(-0.32, Math.min(0.36, rho));
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedOf(legs: EvLeg[]): number {
  let s = 2166136261;
  for (const leg of legs) {
    s ^= Math.round(clampProb(leg.cover) * 10000);
    s = Math.imul(s, 16777619);
    s ^= (leg.gamePk ?? 0) + leg.playerId;
    s = Math.imul(s, 16777619);
    for (let i = 0; i < leg.teamAbbr.length; i += 1) {
      s ^= leg.teamAbbr.charCodeAt(i);
      s = Math.imul(s, 16777619);
    }
  }
  return s >>> 0;
}

function normCdf(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.2316419 * z);
  const d = 0.3989423 * Math.exp(-0.5 * x * x);
  const p =
    d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

function cholesky(A: number[][]): number[][] | null {
  const n = A.length;
  const L = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j <= i; j += 1) {
      let s = A[i][j];
      for (let k = 0; k < j; k += 1) s -= L[i][k] * L[j][k];
      if (i === j) {
        if (s <= 1e-12) return null;
        L[i][j] = Math.sqrt(s);
      } else {
        L[i][j] = s / L[j][j];
      }
    }
  }
  return L;
}

function corrMatrix(legs: EvLeg[]): number[][] {
  const n = legs.length;
  const R = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : pairRho(legs[i], legs[j]))),
  );
  return R;
}

function factorize(R: number[][]): number[][] {
  let scale = 1;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const n = R.length;
    const A = R.map((row, i) => row.map((v, j) => (i === j ? 1 : v * scale)));
    const L = cholesky(A);
    if (L) return L;
    scale *= 0.82;
  }
  return R.map((_, i) => Array.from({ length: R.length }, (_, j) => (i === j ? 1 : 0)));
}

function gaussianPair(rng: () => number): [number, number] {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  const mag = Math.sqrt(-2 * Math.log(u));
  const ang = 2 * Math.PI * v;
  return [mag * Math.cos(ang), mag * Math.sin(ang)];
}

function hasCorrelation(legs: EvLeg[]): boolean {
  for (let i = 0; i < legs.length; i += 1) {
    for (let j = i + 1; j < legs.length; j += 1) {
      if (Math.abs(pairRho(legs[i], legs[j])) > 0.01) return true;
    }
  }
  return false;
}

function pairJoint(p1: number, p2: number, rho: number): number {
  const a = clampProb(p1);
  const b = clampProb(p2);
  const cov = rho * Math.sqrt(a * (1 - a) * b * (1 - b));
  return Math.max(0, Math.min(Math.min(a, b), a * b + cov));
}

function correlatedDist(legs: EvLeg[]): number[] {
  const n = legs.length;
  const p = legs.map((l) => clampProb(l.cover));
  if (n <= 0) return [1];
  if (n === 1) return [1 - p[0], p[0]];
  if (n === 2) {
    const both = pairJoint(p[0], p[1], pairRho(legs[0], legs[1]));
    const only0 = p[0] - both;
    const only1 = p[1] - both;
    const none = 1 - both - only0 - only1;
    return [Math.max(0, none), Math.max(0, only0 + only1), Math.max(0, both)];
  }
  if (!hasCorrelation(legs)) {
    let dp = [1];
    for (const pi of p) {
      const next = new Array(dp.length + 1).fill(0);
      for (let k = 0; k < dp.length; k += 1) {
        next[k] += dp[k] * (1 - pi);
        next[k + 1] += dp[k] * pi;
      }
      dp = next;
    }
    return dp;
  }
  const L = factorize(corrMatrix(legs));
  const rng = mulberry32(seedOf(legs));
  const dist = Array(n + 1).fill(0);
  const z = Array(n).fill(0);
  for (let s = 0; s < SIMS; s += 1) {
    for (let i = 0; i < n; i += 2) {
      const [g0, g1] = gaussianPair(rng);
      z[i] = g0;
      if (i + 1 < n) z[i + 1] = g1;
    }
    let hits = 0;
    for (let i = 0; i < n; i += 1) {
      let x = 0;
      for (let j = 0; j <= i; j += 1) x += L[i][j] * z[j];
      if (normCdf(x) < p[i]) hits += 1;
    }
    dist[hits] += 1;
  }
  return dist.map((c) => c / SIMS);
}

export function pricedReturn(kind: SlipKind, legs: EvLeg[]): number {
  const n = legs.length;
  if (n <= 1) return 1;
  const dist = correlatedDist(legs);
  let ev = 0;
  for (let k = 0; k < dist.length; k += 1) {
    ev += dist[k] * payoutReturn(kind, n, k);
  }
  return ev;
}

function logGrowth(f: number, dist: number[], kind: SlipKind, n: number): number {
  if (f <= 0) return 0;
  let g = 0;
  for (let k = 0; k < dist.length; k += 1) {
    const wealth = 1 + f * (payoutReturn(kind, n, k) - 1);
    if (wealth <= 1e-9) return Number.NEGATIVE_INFINITY;
    g += dist[k] * Math.log(wealth);
  }
  return g;
}

export function kellyFraction(kind: SlipKind, legs: EvLeg[]): number {
  const n = legs.length;
  if (n <= 1) return 0;
  const dist = correlatedDist(legs);
  let lo = 0;
  let hi = 0.99;
  for (let i = 0; i < 28; i += 1) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (logGrowth(m1, dist, kind, n) < logGrowth(m2, dist, kind, n)) lo = m1;
    else hi = m2;
  }
  const f = (lo + hi) / 2;
  if (logGrowth(f, dist, kind, n) <= 1e-12) return 0;
  return f;
}

export function sizeOf(ev: number): EvSize {
  if (ev < 1) return "pass";
  if (ev < 1.08) return "half";
  if (ev < 1.28) return "full";
  return "max";
}

export function stackFlags(legs: EvLeg[]): { team: string; n: number }[] {
  const byTeam = new Map<string, number>();
  for (const leg of legs) {
    byTeam.set(leg.teamAbbr, (byTeam.get(leg.teamAbbr) ?? 0) + 1);
  }
  return [...byTeam.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([team, n]) => ({ team, n }));
}

export function sameGameCount(picked: EvLeg[], cand: EvLeg): number {
  return picked.filter((l) => sameGame(l, cand)).length;
}

function contribs(kind: SlipKind, legs: EvLeg[]): LegContrib[] {
  if (legs.length <= 1) return [];
  const full = pricedReturn(kind, legs);
  return legs.map((leg, i) => {
    const rest = legs.filter((_, j) => j !== i);
    const without = rest.length <= 1 ? 1 : pricedReturn(kind, rest);
    return {
      playerId: leg.playerId,
      name: leg.name,
      market: leg.market,
      cover: leg.cover,
      delta: full - without,
    };
  });
}

function asEvLegs(legs: SlipLeg[]): EvLeg[] {
  return legs
    .filter((l) => l.result !== "dnp")
    .map((l) => ({
      playerId: l.playerId,
      name: l.name,
      teamAbbr: l.teamAbbr,
      opponentAbbr: l.opponentAbbr,
      market: l.market,
      side: l.side,
      oddsType: l.oddsType,
      cover: l.cover,
      gamePk: l.gamePk,
    }));
}

export function slipEv(slip: SlipCard): SlipEv {
  const kind = kindOf(slip);
  const legs = asEvLegs(slip.legs);
  const n = legs.length;
  const independent = expectedReturn(
    kind,
    legs.map((l) => l.cover),
  );
  const correlated = n <= 1 ? 1 : pricedReturn(kind, legs);
  const meanCover = n ? legs.reduce((s, l) => s + clampProb(l.cover), 0) / n : 0.5;
  const be = breakEvenCover(kind, Math.max(n, 2));
  const altKind: SlipKind = kind === "power" ? "flex" : "power";
  const altReturn = n <= 1 ? 1 : pricedReturn(altKind, legs);
  const kelly = kellyFraction(kind, legs);
  return {
    kind,
    n,
    independent,
    correlated,
    breakEven: be,
    meanCover,
    edge: meanCover - be,
    kelly,
    quarterKelly: kelly / 4,
    size: sizeOf(correlated),
    altKind,
    altReturn,
    stacks: stackFlags(legs),
    contrib: contribs(kind, legs).sort((a, b) => a.delta - b.delta),
  };
}

export function formatEv(multiplier: number): string {
  if (!Number.isFinite(multiplier)) return "—";
  const rounded = Math.round(multiplier * 100) / 100;
  if (Number.isInteger(rounded)) return `${rounded}x`;
  return `${rounded.toFixed(2)}x`;
}

export function formatCoverPct(p: number): string {
  return `${Math.round(p * 100)}%`;
}

export function formatKelly(q: number): string {
  if (q < 0.001) return "0%";
  return `${(q * 100).toFixed(1)}%`;
}

export function sizeLabel(size: EvSize): string {
  if (size === "pass") return "Pass";
  if (size === "half") return "Half";
  if (size === "max") return "Max";
  return "Full";
}

export function sizeVariant(size: EvSize): "brick" | "lean" | "pine" | "smash" {
  if (size === "pass") return "brick";
  if (size === "half") return "lean";
  if (size === "max") return "smash";
  return "pine";
}

export function dragCopy(ev: SlipEv): string | null {
  const worst = ev.contrib[0];
  if (!worst || worst.delta >= -0.03) return null;
  const last = worst.name.split(" ").slice(-1)[0];
  const mag = Math.abs(worst.delta).toFixed(2);
  return `${last} drags −${mag}x`;
}

export function altCopy(ev: SlipEv): string | null {
  if (ev.n !== 2 && ev.n !== 3) return null;
  if (ev.altKind === "flex" && ev.altReturn > ev.correlated + 0.05) {
    return `Flex ${ev.n} would be ${formatEv(ev.altReturn)} vs Power ${formatEv(ev.correlated)}`;
  }
  if (ev.altKind === "power" && ev.altReturn > ev.correlated + 0.08) {
    return `Power ${ev.n} would be ${formatEv(ev.altReturn)} vs Flex ${formatEv(ev.correlated)}`;
  }
  return null;
}
