import type { PropMarket, SlipCard, SlipLeg } from "./types.ts";

export type SlipKind = "power" | "flex";
export type PayoutStatus = "cash" | "flex" | "loss" | "void" | "open";

export type SlipPayout = {
  size: 2 | 3 | 6;
  title: string;
  kind: SlipKind;
  status: PayoutStatus;
  hits: number;
  misses: number;
  dnp: number;
  open: number;
  active: number;
  multiplier: number | null;
  units: number | null;
  expectedMultiplier: number;
  expectedUnits: number;
};

export type MarketLeak = {
  market: PropMarket;
  hits: number;
  n: number;
  dnp: number;
  expected: number;
  brier: number | null;
  avgMargin: number | null;
};

export type DeskReport = {
  hits: number;
  n: number;
  dnp: number;
  expectedHits: number;
  brier: number | null;
  logLoss: number | null;
  units: number | null;
  expectedUnits: number | null;
  staked: number;
  cashed: number;
  lost: number;
  flexed: number;
  voided: number;
  open: number;
  slips: SlipPayout[];
  byMarket: MarketLeak[];
};

/** PrizePicks standard Power Play — total return, Sept 2026. */
const POWER_RETURN: Record<number, number> = {
  2: 3,
  3: 6,
  4: 10,
  5: 20,
  6: 37.5,
};

/** PrizePicks standard Flex — [active size][hits] → total return, Sept 2026. */
const FLEX_RETURN: Record<number, Record<number, number>> = {
  2: { 2: 2, 1: 0.5 },
  3: { 3: 3, 2: 1 },
  4: { 4: 6, 3: 1.5 },
  5: { 5: 10, 4: 2, 3: 0.4 },
  6: { 6: 25, 5: 2, 4: 0.4 },
};

const MARKET_ORDER: PropMarket[] = ["hr", "hits", "tb", "rbi", "sb", "k", "hrrbi", "runs", "fs"];

const SMASH_MARGIN = 2;

export function kindOf(slip: SlipCard): SlipKind {
  if (slip.play === "flex" || slip.play === "power") return slip.play;
  return slip.size === 6 ? "flex" : "power";
}

export function clampProb(p: number): number {
  if (!Number.isFinite(p)) return 0.5;
  return Math.min(0.98, Math.max(0.02, p));
}

/** Total return for a settled card. Active ≤ 1 is a void (stake back). */
export function payoutReturn(kind: SlipKind, active: number, hits: number): number {
  if (active <= 1) return 1;
  if (kind === "power") return hits === active ? (POWER_RETURN[active] ?? 0) : 0;
  return FLEX_RETURN[active]?.[hits] ?? 0;
}

function poissonBinomial(probs: number[]): number[] {
  let dp = [1];
  for (const p of probs) {
    const next = new Array(dp.length + 1).fill(0);
    for (let k = 0; k < dp.length; k += 1) {
      next[k] += dp[k] * (1 - p);
      next[k + 1] += dp[k] * p;
    }
    dp = next;
  }
  return dp;
}

/** Independent Poisson-binomial expected multiplier from cover probs. */
export function expectedReturn(kind: SlipKind, covers: number[]): number {
  const n = covers.length;
  if (n <= 0) return 1;
  if (n === 1) return 1;
  const dist = poissonBinomial(covers.map(clampProb));
  let ev = 0;
  for (let k = 0; k < dist.length; k += 1) {
    ev += dist[k] * payoutReturn(kind, n, k);
  }
  return ev;
}

export function legMargin(leg: SlipLeg): number | null {
  if (leg.actual == null) return null;
  if (leg.result === "dnp" || leg.result === "pending" || !leg.result) return null;
  return leg.side === "over" ? leg.actual - leg.line : leg.line - leg.actual;
}

export function isSmash(leg: SlipLeg): boolean {
  if (leg.result !== "hit") return false;
  const margin = legMargin(leg);
  return margin != null && margin >= SMASH_MARGIN;
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function slipPayout(slip: SlipCard): SlipPayout {
  const kind = kindOf(slip);
  const hits = slip.legs.filter((l) => l.result === "hit").length;
  const misses = slip.legs.filter((l) => l.result === "miss").length;
  const dnp = slip.legs.filter((l) => l.result === "dnp").length;
  const open = slip.legs.filter((l) => !l.result || l.result === "pending").length;
  const active = slip.legs.length - dnp;
  const covers = slip.legs.filter((l) => l.result !== "dnp").map((l) => clampProb(l.cover));
  const expectedMultiplier = expectedReturn(kind, covers);
  const expectedUnits = expectedMultiplier - 1;

  if (open > 0) {
    return {
      size: slip.size,
      title: slip.title,
      kind,
      status: "open",
      hits,
      misses,
      dnp,
      open,
      active,
      multiplier: null,
      units: null,
      expectedMultiplier,
      expectedUnits,
    };
  }

  if (active <= 1) {
    return {
      size: slip.size,
      title: slip.title,
      kind,
      status: "void",
      hits,
      misses,
      dnp,
      open,
      active,
      multiplier: 1,
      units: 0,
      expectedMultiplier,
      expectedUnits,
    };
  }

  const multiplier = payoutReturn(kind, active, hits);
  const status: PayoutStatus = multiplier <= 0 ? "loss" : hits === active ? "cash" : "flex";
  return {
    size: slip.size,
    title: slip.title,
    kind,
    status,
    hits,
    misses,
    dnp,
    open,
    active,
    multiplier,
    units: multiplier - 1,
    expectedMultiplier,
    expectedUnits,
  };
}

function marketLeak(legs: SlipLeg[]): MarketLeak[] {
  const groups = new Map<PropMarket, SlipLeg[]>();
  for (const leg of legs) {
    const list = groups.get(leg.market) ?? [];
    list.push(leg);
    groups.set(leg.market, list);
  }
  return [...groups.entries()]
    .map(([market, rows]) => {
      const decided = rows.filter((l) => l.result === "hit" || l.result === "miss");
      const hits = decided.filter((l) => l.result === "hit").length;
      const dnp = rows.filter((l) => l.result === "dnp").length;
      const briers = decided.map((l) => {
        const y = l.result === "hit" ? 1 : 0;
        return (clampProb(l.cover) - y) ** 2;
      });
      const margins = decided.map(legMargin).filter((m): m is number => m != null);
      return {
        market,
        hits,
        n: decided.length,
        dnp,
        expected: decided.reduce((s, l) => s + clampProb(l.cover), 0),
        brier: mean(briers),
        avgMargin: mean(margins),
      };
    })
    .filter((row) => row.n + row.dnp > 0)
    .sort((a, b) => b.n - a.n || MARKET_ORDER.indexOf(a.market) - MARKET_ORDER.indexOf(b.market));
}

export function reportOf(slips: SlipCard[]): DeskReport {
  const live = slips.filter((s) => !s.skip && s.legs.length > 0);
  const payouts = live.map(slipPayout);
  const legs = live.flatMap((s) => s.legs);
  const decided = legs.filter((l) => l.result === "hit" || l.result === "miss");
  const hits = decided.filter((l) => l.result === "hit").length;
  const dnp = legs.filter((l) => l.result === "dnp").length;
  const expectedHits = decided.reduce((s, l) => s + clampProb(l.cover), 0);
  const briers = decided.map((l) => {
    const y = l.result === "hit" ? 1 : 0;
    return (clampProb(l.cover) - y) ** 2;
  });
  const logLosses = decided.map((l) => {
    const p = clampProb(l.cover);
    const y = l.result === "hit" ? 1 : 0;
    return -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
  });

  const settled = payouts.filter((p) => p.status !== "open");
  const units = settled.length ? settled.reduce((s, p) => s + (p.units ?? 0), 0) : null;
  const expectedUnits = settled.length ? settled.reduce((s, p) => s + p.expectedUnits, 0) : null;

  return {
    hits,
    n: decided.length,
    dnp,
    expectedHits,
    brier: mean(briers),
    logLoss: mean(logLosses),
    units,
    expectedUnits,
    staked: settled.length,
    cashed: payouts.filter((p) => p.status === "cash").length,
    lost: payouts.filter((p) => p.status === "loss").length,
    flexed: payouts.filter((p) => p.status === "flex").length,
    voided: payouts.filter((p) => p.status === "void").length,
    open: payouts.filter((p) => p.status === "open").length,
    slips: payouts,
    byMarket: marketLeak(legs),
  };
}

export function ledgerReport(log: Array<{ slips: SlipCard[] }>): DeskReport {
  return reportOf(log.flatMap((e) => e.slips));
}

export function formatUnits(units: number): string {
  if (Math.abs(units) < 0.05) return "0.0u";
  const sign = units > 0 ? "+" : "−";
  return `${sign}${Math.abs(units).toFixed(1)}u`;
}

export function formatMult(multiplier: number): string {
  const rounded = Math.round(multiplier * 10) / 10;
  const label = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${label}x`;
}

export function payoutLabel(payout: SlipPayout): string {
  if (payout.status === "open") return "Open";
  if (payout.status === "void") return "Void";
  if (payout.status === "loss") return "Loss";
  if (payout.multiplier == null) return "Open";
  if (payout.status === "flex") return `Flex ${formatMult(payout.multiplier)}`;
  return `Cash ${formatMult(payout.multiplier)}`;
}

export function payoutVariant(status: PayoutStatus): "pine" | "brick" | "lean" | "default" {
  if (status === "cash") return "pine";
  if (status === "loss") return "brick";
  if (status === "flex") return "lean";
  return "default";
}

export function unitsTone(units: number | null): "pine" | "brick" | "muted" {
  if (units == null || Math.abs(units) < 0.05) return "muted";
  return units > 0 ? "pine" : "brick";
}
