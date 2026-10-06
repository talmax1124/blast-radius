import { clamp } from "./parse.ts";
import { aceSuppress, expectedPaOf, hrDrought, isAcePitcher, isOpener, leanFrom } from "./score.ts";
import { expectedReturn } from "./grade.ts";
import {
  breakEvenCover,
  juiceFloor,
  pricedReturn,
  sameGameCount,
  sizeLabel,
  sizeOf,
  type EvLeg,
} from "./ev.ts";
import { matchBookProp } from "./odds.ts";
import type {
  BatterPick,
  BookProp,
  Lean,
  LegResult,
  LineupStatus,
  PitcherPick,
  PropLine,
  PropMarket,
  SlipCard,
  SlipLeg,
} from "./types.ts";

function fact(n: number): number {
  let x = 1;
  for (let i = 2; i <= n; i += 1) x *= i;
  return x;
}

function poissonAtLeast(k: number, lambda: number): number {
  if (lambda <= 0) return k <= 0 ? 1 : 0;
  if (k <= 0) return 1;
  let cdf = 0;
  const cap = Math.min(24, Math.max(k - 1, 0) + 12);
  for (let i = 0; i <= Math.min(k - 1, cap); i += 1) {
    cdf += Math.exp(-lambda) * lambda ** i / fact(i);
  }
  return clamp(1 - cdf, 0.02, 0.97);
}

function binom(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  let c = 1;
  for (let i = 1; i <= k; i += 1) c = (c * (n - k + i)) / i;
  return c;
}

function binomAtLeast(k: number, n: number, p: number): number {
  const trials = Math.max(1, Math.round(n));
  const prob = clamp(p, 0.02, 0.55);
  if (k <= 0) return 1;
  let s = 0;
  for (let i = k; i <= trials; i += 1) {
    s += binom(trials, i) * prob ** i * (1 - prob) ** (trials - i);
  }
  return clamp(s, 0.02, 0.97);
}

function overNeed(line: number): number {
  return Math.floor(line) + 1;
}

/** Mix Poisson with a wider zero-heavy draw so 1.5 counting lines aren't fake 65% locks. */
function dispersedAtLeast(need: number, mean: number): number {
  const raw = poissonAtLeast(need, mean);
  const wide = poissonAtLeast(need, mean * 0.78);
  return 0.6 * raw + 0.4 * wide;
}

function gamesOf(pa: number): number {
  return Math.max(pa / 4.15, 1);
}

function shrink(cover: number, weight: number): number {
  return clamp(0.5 + weight * (cover - 0.5), 0.08, 0.9);
}

export function coverProb(pick: BatterPick | PitcherPick, line: PropLine): number {
  const need = overNeed(line.line);
  if (pick.market === "k") {
    const p = pick as PitcherPick;
    const mean =
      p.impliedK > 0
        ? p.impliedK
        : (() => {
            const k9 = p.pitcher.recentK9 != null ? 0.52 * p.pitcher.k9 + 0.48 * p.pitcher.recentK9 : p.pitcher.k9;
            const ip =
              p.pitcher.recentIp && p.pitcher.recentIp >= 4
                ? clamp(p.pitcher.recentIp, 4.5, 6.3)
                : clamp(5.0 + p.pitcher.gamesStarted / 40, 4.6, 6.2);
            const parkAdj = (p.parkKFactor || 100) / 100;
            const oppAdj = clamp(0.88 + p.oppKRate * 0.55, 0.9, 1.12);
            return ((k9 * ip) / 9) * parkAdj * oppAdj;
          })();
    const over = poissonAtLeast(need, mean);
    let cover = line.side === "under" ? 1 - over : over;
    if (line.line >= 6.5) cover = shrink(cover, 0.78);
    if (line.oddsType === "demon") cover = shrink(cover, 0.82);
    if ("gameState" in pick && pick.gameState === "Live") cover *= 0.85;
    return cover;
  }

  const b = pick as BatterPick;
  const pa = expectedPaOf(b.lineupSlot || 5);
  const ab = pa * 0.88;
  const g = gamesOf(b.season.pa);
  const aceLive = aceSuppress({
    id: 0,
    name: b.pitcherName ?? "",
    hand: b.pitcherHand,
    era: b.edge?.pitcherXera ?? 4.2,
    hr9: b.edge?.pitcherVsHandHr9 ?? 1.15,
    k9: b.edge?.pitcherK9 ?? b.edge?.pitcherVsHandK9 ?? 8.5,
    whip: b.edge?.pitcherWhip ?? 1.25,
    hits9: b.edge?.pitcherVsHandHits9 ?? 8.4,
    goAo: 1,
    ip: 0,
    hr: 0,
    k: 0,
    gamesStarted: 20,
    gamesPlayed: 20,
    opener: Boolean(b.opener),
    xera: b.edge?.pitcherXera ?? null,
    arsenal: [],
    vsL: null,
    vsR: null,
    sbRate: null,
    recentK9: null,
    recentIp: null,
    bf: 0,
    recentK: null,
    recentBf: null,
  });
  const rawSuppress = b.opener ? 1.08 : aceLive.factor;
  const onBase = pick.market === "hrrbi" || pick.market === "fs" || pick.market === "runs";
  const suppress = onBase ? (b.opener ? 1.04 : clamp(rawSuppress, 0.72, 1.04)) : rawSuppress;
  const hitsAdj = clamp((b.edge?.pitcherVsHandHits9 ?? 8.4) / 8.5, 0.74, 1.16);
  const parkH = ((b.parkHrFactor || 100) + 100) / 200;
  const form =
    b.recent && b.recent.pa >= 16 ? clamp(b.recent.avg / Math.max(b.season.avg, 0.2), 0.72, 1.16) : 1;
  const mixTilt = clamp(b.dmgMult || 1, 0.78, 1.22);
  const recencyTilt = (b.flags ?? []).includes("hot") ? 1.04 : (b.flags ?? []).includes("cold") ? 0.86 : 1;

  let over = 0.5;
  if (pick.market === "hr") {
    const pHr = (b.impliedHr || (b.season.hr / Math.max(b.season.pa, 1)) * pa) * suppress;
    over = poissonAtLeast(need, Math.max(pHr, 0.04));
    over = shrink(over, 0.55);
  } else if (pick.market === "hits") {
    const p = clamp((b.saber?.xba ?? b.season.avg) * hitsAdj * suppress * form * mixTilt * recencyTilt, 0.14, 0.38);
    over = binomAtLeast(need, ab, p);
    if (line.line >= 1.5) over = shrink(over, 0.22);
  } else if (pick.market === "tb") {
    const tbG = b.season.tb / g;
    const recentTb = b.recent && b.recent.pa >= 16 ? b.recent.tb / Math.max(b.recent.pa / 4.15, 1) : tbG;
    const xTb = (b.saber?.xslg ?? b.season.slg) * ab;
    const mean = (0.7 * tbG + 0.18 * xTb + 0.12 * recentTb) * parkH * hitsAdj * suppress * form * mixTilt * recencyTilt;
    over = dispersedAtLeast(need, Math.max(mean, 0.35));
    if (line.line >= 1.5) over = shrink(over, 0.22);
  } else if (pick.market === "rbi") {
    const mean = (b.season.rbi / g) * (pa / 4.15) * (b.lineupSlot >= 2 && b.lineupSlot <= 5 ? 1.06 : 0.9) * suppress * form * recencyTilt;
    over = dispersedAtLeast(need, Math.max(mean, 0.12));
    if (line.line >= 1.5) over = shrink(over, 0.22);
  } else if (pick.market === "runs") {
    const mean = ((b.season.runs || 0) / g) * (pa / 4.15) * (b.lineupSlot <= 2 ? 1.08 : 0.95) * suppress * form * recencyTilt;
    over = dispersedAtLeast(need, Math.max(mean, 0.12));
    if (line.line >= 1.5) over = shrink(over, 0.24);
  } else if (pick.market === "hrrbi") {
    const comboG = (b.season.hits + (b.season.runs || 0) + b.season.rbi) / g;
    const recentCombo =
      b.recent && b.recent.pa >= 16
        ? (b.recent.hits + b.recent.runs + b.recent.rbi) / Math.max(b.recent.pa / 4.15, 1)
        : comboG;
    const mean = (0.78 * comboG + 0.22 * recentCombo) * (pa / 4.15) * parkH * hitsAdj * suppress * form * mixTilt * recencyTilt;
    over = dispersedAtLeast(need, Math.max(mean, 0.5));
    if (line.line >= 1.5) over = shrink(over, 0.18);
  } else if (pick.market === "fs") {
    const bbG = Math.max(b.season.obp - b.season.avg, 0.05) * 4.15;
    const fsG = b.season.tb / g + (b.season.runs || 0) / g + b.season.rbi / g + b.season.sb / g + bbG + 0.85;
    const slotBoost = b.lineupSlot <= 2 ? 1.12 : b.lineupSlot <= 5 ? 1.06 : 0.94;
    const mean = fsG * (pa / 4.15) * parkH * hitsAdj * suppress * form * mixTilt * recencyTilt * slotBoost;
    over = dispersedAtLeast(need, Math.max(mean, line.line * 0.7 + 1.4));
    if (line.line >= 7.5) over = shrink(over, 0.36);
    else if (line.line >= 5.5) over = shrink(over, 0.48);
    else over = shrink(over, 0.7);
  } else {
    const mean = (b.season.sb / Math.max(b.season.pa / 4.1, 1)) * 0.85;
    over = poissonAtLeast(need, Math.max(mean, 0.05));
  }

  let cover = line.side === "under" ? 1 - over : over;
  if ((b.flags ?? []).includes("cold") && line.side === "over") cover *= 0.9;
  if ((b.flags ?? []).includes("thin") && line.side === "over") cover *= 0.92;
  if (facingAce(b) && damageVsAce(pick.market) && line.side === "over") cover *= 0.88;
  if ("gameState" in pick && pick.gameState === "Live") cover *= 0.85;
  return cover;
}

export type BoxActual = {
  hr: number;
  hits: number;
  tb: number;
  rbi: number;
  sb: number;
  k: number;
  runs: number;
  pa: number;
  pitcherK: number;
  walks: number;
  inProgress?: boolean;
};

export type LegCandidate = SlipLeg & {
  gamePk: number;
  edge: number;
  opener?: boolean;
};

function toLeg(pick: BatterPick | PitcherPick, line: PropLine, cover: number, edge: number): LegCandidate {
  const reason =
    pick.reasons[0] ??
    `${line.side === "over" ? "Over" : "Under"} ${line.line} ${line.stat}`;
  const lineupStatus: LineupStatus | undefined = "lineupStatus" in pick ? pick.lineupStatus : undefined;
  return {
    playerId: pick.playerId,
    name: pick.name,
    teamAbbr: pick.teamAbbr,
    opponentAbbr: pick.opponentAbbr,
    market: pick.market,
    stat: line.stat,
    line: line.line,
    side: line.side,
    oddsType: line.oddsType,
    score: pick.score,
    lean: pick.lean,
    reason,
    cover,
    edge,
    gamePk: pick.gamePk,
    lineupStatus,
    opener: isBatter(pick) ? pick.opener : false,
  };
}

function isBatter(pick: BatterPick | PitcherPick): pick is BatterPick {
  return pick.market !== "k";
}

function juiceLine(market: PropMarket, line: number): boolean {
  if (market === "hrrbi" || market === "tb") return line >= 1.5;
  if (market === "hits") return line >= 1.5;
  if (market === "fs") return line >= 5.5;
  if (market === "rbi") return line >= 1.5;
  return false;
}

/** 1.5 H+R+RBI / TB / Hits / RBI from weak bats — not a blanket ban. Quality 1.5s can sit on Core and Flex. */
function weakJuice(pick: BatterPick, line: PropLine): boolean {
  if (line.side !== "over") return false;
  if (!juiceLine(pick.market, line.line)) return false;
  if (pick.lineupSlot >= 6) return true;
  if (pick.score < 62) return true;
  if ((pick.flags ?? []).includes("thin")) return true;
  if ((pick.flags ?? []).includes("cold") && pick.score < 70) return true;
  if (pick.season.pa < 140) return true;
  if (pick.saber?.wrcPlus != null && pick.saber.wrcPlus < 98) return true;
  return false;
}

function countingMarket(market: PropMarket): boolean {
  return market === "hrrbi" || market === "fs" || market === "runs" || market === "rbi";
}

function powerBlockedCounting(leg: { market: PropMarket; line: number }): boolean {
  if (leg.market === "hrrbi" || leg.market === "rbi") return true;
  if (leg.market === "runs" && leg.line >= 1.5) return true;
  if (leg.market === "fs" && juiceLine(leg.market, leg.line)) return true;
  return false;
}

function damageVsAce(market: PropMarket): boolean {
  return market === "hr" || market === "tb" || market === "hits";
}

function facingAce(pick: BatterPick): boolean {
  if (pick.opener) return false;
  return isAcePitcher(pick.edge?.pitcherK9, pick.edge?.pitcherXera, pick.edge?.pitcherWhip);
}

export function collectLegs(
  batters: BatterPick[],
  pitchers: PitcherPick[],
  books: BookProp[] = [],
): LegCandidate[] {
  const out: LegCandidate[] = [];
  const seen = new Set<string>();
  const push = (pick: BatterPick | PitcherPick) => {
    if (!pick.propLine) return;
    if (isBatter(pick) && !pick.inLineup && pick.lineupStatus !== "expected") return;
    if ("gameState" in pick && (pick.gameState === "Final" || pick.gameState === "Live")) return;
    const line = pick.propLine;
    const counting = countingMarket(pick.market);
    if (pick.score < (pick.market === "fs" ? 40 : 50)) return;
    if (!counting && pick.market !== "k" && pick.score < 54) return;
    if (pick.market === "k" && line.side === "under") return;
    if (pick.market === "k" && isOpener((pick as PitcherPick).pitcher)) return;
    if (pick.market === "hr" && line.oddsType === "standard") return;
    if (isBatter(pick) && weakJuice(pick, line)) return;
    if (isBatter(pick) && pick.season.pa < 90 && counting) return;
    if (isBatter(pick) && pick.season.pa < 100 && pick.market !== "hr" && pick.market !== "sb" && !counting) return;
    if (pick.market === "runs" && isBatter(pick) && pick.season.pa < 100) return;
    if (line.line <= 0.5 && (pick.market === "tb" || pick.market === "hits") && line.side === "over" && pick.score < 54) return;
    if (pick.market === "hrrbi" && line.line <= 0.5 && line.side === "over" && pick.score < 72) return;
    if (pick.market === "k" && pick.score < 48) return;
    if (pick.market === "k" && line.line < 4.5) return;
    if (pick.market === "k" && line.line >= 6.5 && line.oddsType === "demon") return;
    if (pick.market === "runs" && pick.score < 54) return;
    if (isBatter(pick) && pick.market === "hr" && line.side === "over" && hrDrought(pick.recent) && (pick.saber?.barrelPa ?? 0) < 7) return;
    if (isBatter(pick) && line.side === "over" && damageVsAce(pick.market) && facingAce(pick)) return;
    if (isBatter(pick) && (pick.flags ?? []).includes("cold") && juiceLine(pick.market, line.line) && line.side === "over") return;
    if (isBatter(pick) && juiceLine(pick.market, line.line) && line.side === "over") {
      if (pick.lineupSlot >= 6) return;
      if ((pick.flags ?? []).includes("thin")) return;
      if (pick.recent && pick.recent.pa < 16) return;
      if (pick.saber?.wrcPlus != null && pick.saber.wrcPlus < 98) return;
      if (pick.recent && pick.recent.pa >= 20 && pick.recent.avg < 0.2) return;
      if (pick.score < 62) return;
    }
    if (books.length && line.side === "over") {
      const book = matchBookProp(books, pick.name, pick.market, line.line);
      if (book) {
        if (book.implied > 0 && book.implied < 0.36) return;
        if (book.line - line.line >= 1) return;
      }
    }
    let cover = coverProb(pick, line);
    const edge = cover - juiceFloor(line.oddsType);
    if (line.oddsType === "demon" && cover < 0.6) return;
    if (line.oddsType === "standard" && line.side === "over" && pick.market === "k" && cover < 0.5) return;
    if (line.oddsType === "standard" && line.side === "over" && juiceLine(pick.market, line.line) && cover < 0.58) return;
    if (line.oddsType === "standard" && line.side === "over" && pick.market === "fs" && cover < 0.54) return;
    if (line.oddsType === "standard" && line.side === "over" && pick.market !== "k" && pick.market !== "fs" && cover < 0.52) return;
    if (line.oddsType === "goblin" && cover < 0.6) return;
    if (line.oddsType === "goblin" && pick.market === "hr") return;
    if (edge < 0) return;
    const key = `${pick.playerId}:${pick.market}:${pick.propLine.line}:${pick.propLine.side}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(toLeg(pick, pick.propLine, cover, edge));
  };
  for (const p of batters) push(p);
  for (const p of pitchers) push(p);
  out.sort((a, b) => b.edge - a.edge || b.score - a.score);
  return out;
}

type SlipFlavor = "power" | "core" | "flex";

const PREFER: Record<SlipFlavor, PropMarket[]> = {
  power: ["k", "hits", "sb", "runs", "fs"],
  core: ["k", "hits", "runs", "fs", "sb"],
  flex: ["k", "fs", "hits", "runs", "sb"],
};

function asEv(legs: LegCandidate[]): EvLeg[] {
  return legs.map((l) => ({
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

function flavorKind(flavor: SlipFlavor): "power" | "flex" {
  return flavor === "flex" ? "flex" : "power";
}

function greedy(
  pool: LegCandidate[],
  size: 2 | 3 | 6,
  exclude: Set<number>,
  flavor: SlipFlavor,
): LegCandidate[] {
  const maxPerGame = size === 6 ? 2 : 1;
  const maxPerMarket = flavor === "power" ? 2 : size === 6 ? 3 : 2;
  const prefer = PREFER[flavor];
  const kind = flavorKind(flavor);
  const ranked = [...pool].sort((a, b) => {
    const ap = prefer.includes(a.market) ? 0.05 : 0;
    const bp = prefer.includes(b.market) ? 0.05 : 0;
    const aK = a.market === "k" ? 0.08 : 0;
    const bK = b.market === "k" ? 0.08 : 0;
    const aConf = a.lineupStatus === "confirmed" ? 0.03 : 0;
    const bConf = b.lineupStatus === "confirmed" ? 0.03 : 0;
    const aGob = a.oddsType === "goblin" ? -0.05 : 0;
    const bGob = b.oddsType === "goblin" ? -0.05 : 0;
    const aEx = exclude.has(a.playerId) ? -10 : 0;
    const bEx = exclude.has(b.playerId) ? -10 : 0;
    const aOp = a.opener && flavor !== "power" ? 0.04 : 0;
    const bOp = b.opener && flavor !== "power" ? 0.04 : 0;
    const aQ = 0.62 * a.edge + 0.38 * (a.score / 100) + ap + aK + aConf + aGob + aEx + aOp;
    const bQ = 0.62 * b.edge + 0.38 * (b.score / 100) + bp + bK + bConf + bGob + bEx + bOp;
    return bQ - aQ;
  });
  const picked: LegCandidate[] = [];
  const usedPlayer = new Set<number>();
  const usedKey = new Set<string>();
  const perGame = new Map<number, number>();
  const perMarket = new Map<string, number>();

  const juiceCount = () =>
    picked.filter((l) => l.side === "over" && juiceLine(l.market, l.line)).length;

  const blocked = (leg: LegCandidate, relax: boolean) => {
    if (exclude.has(leg.playerId)) return true;
    if (usedPlayer.has(leg.playerId)) return true;
    if (usedKey.has(`${leg.playerId}:${leg.market}`)) return true;
    if ((perGame.get(leg.gamePk) ?? 0) >= (flavor === "flex" && relax ? 2 : maxPerGame)) return true;
    if ((perMarket.get(leg.market) ?? 0) >= (relax ? maxPerMarket + 1 : maxPerMarket)) return true;
    if (flavor === "core" && leg.oddsType === "demon") return true;
    if (flavor === "power" && leg.oddsType === "goblin") return true;
    if (flavor === "power" && leg.oddsType === "demon" && (leg.market !== "k" || leg.cover < 0.68)) return true;
    if (flavor === "power" && powerBlockedCounting(leg)) return true;
    if (flavor === "power" && juiceLine(leg.market, leg.line) && leg.side === "over") return true;
    if (flavor === "power" && !relax && leg.cover < 0.52 && leg.market !== "k") return true;
    if (flavor === "power" && (leg.market === "runs" || leg.market === "rbi") && leg.line <= 0.5 && leg.cover < 0.58) return true;
    if (flavor === "power" && !relax && leg.market !== "k" && leg.lineupStatus === "expected" && leg.score < 76) return true;
    if (flavor === "power" && leg.market === "hr") return true;
    if (flavor === "core" && juiceLine(leg.market, leg.line) && leg.side === "over" && juiceCount() >= 1) return true;
    if (flavor === "core" && !relax && leg.cover < 0.53 && leg.market !== "k") return true;
    if (flavor === "core" && !relax && leg.score < 56 && leg.market !== "k") return true;
    if (flavor === "flex" && juiceLine(leg.market, leg.line) && juiceCount() >= 2) return true;
    if (flavor === "flex" && juiceLine(leg.market, leg.line) && leg.cover < 0.56) return true;
    if (flavor === "flex" && !relax && leg.score < 54 && leg.market !== "k") return true;
    if (flavor === "flex" && !relax && leg.cover < 0.52 && leg.market !== "k") return true;
    return false;
  };

  const tryAdd = (leg: LegCandidate, relax: boolean) => {
    if (blocked(leg, relax)) return false;
    picked.push(leg);
    usedPlayer.add(leg.playerId);
    usedKey.add(`${leg.playerId}:${leg.market}`);
    perGame.set(leg.gamePk, (perGame.get(leg.gamePk) ?? 0) + 1);
    perMarket.set(leg.market, (perMarket.get(leg.market) ?? 0) + 1);
    return true;
  };

  const evOf = (legs: LegCandidate[]) => {
    if (legs.length <= 1) return 1;
    const raw = expectedReturn(
      kind,
      legs.map((l) => l.cover),
    );
    if (kind !== "flex") return raw;
    let pairs = 0;
    for (let i = 0; i < legs.length; i += 1) {
      pairs += sameGameCount(asEv(legs.slice(0, i)), asEv([legs[i]])[0]);
    }
    return raw - 0.04 * pairs;
  };

  const pickBest = (relax: boolean) => {
    let best: LegCandidate | null = null;
    let bestEv = Number.NEGATIVE_INFINITY;
    for (const leg of ranked) {
      if (blocked(leg, relax)) continue;
      const ev = evOf([...picked, leg]);
      if (
        ev > bestEv + 1e-6 ||
        (Math.abs(ev - bestEv) <= 1e-6 && best && (leg.edge > best.edge || (leg.edge === best.edge && leg.score > best.score)))
      ) {
        best = leg;
        bestEv = ev;
      }
    }
    return best;
  };

  if (flavor === "power" && size === 2) {
    const cands = ranked.filter((l) => !exclude.has(l.playerId)).slice(0, 40);
    let best: [LegCandidate, LegCandidate] | null = null;
    let bestEv = Number.NEGATIVE_INFINITY;
    let bestK: [LegCandidate, LegCandidate] | null = null;
    let bestKEv = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < cands.length; i += 1) {
      for (let j = i + 1; j < cands.length; j += 1) {
        const a = cands[i];
        const b = cands[j];
        if (a.playerId === b.playerId || a.gamePk === b.gamePk) continue;
        if (a.oddsType === "goblin" || b.oddsType === "goblin") continue;
        const demon = a.oddsType === "demon" || b.oddsType === "demon";
        if (demon) {
          const d = a.oddsType === "demon" ? a : b;
          if (d.market !== "k" || d.cover < 0.68) continue;
        }
        if (powerBlockedCounting(a) || powerBlockedCounting(b)) continue;
        if (a.market === "hr" || b.market === "hr") continue;
        if (juiceLine(a.market, a.line) && a.side === "over") continue;
        if (juiceLine(b.market, b.line) && b.side === "over") continue;
        if (a.cover < 0.5 || b.cover < 0.5) continue;
        if ((a.cover < 0.52 && a.market !== "k") || (b.cover < 0.52 && b.market !== "k")) continue;
        const ev = pricedReturn("power", asEv([a, b]));
        if (ev < 1) continue;
        const hasK = a.market === "k" || b.market === "k";
        if (ev > bestEv) {
          best = [a, b];
          bestEv = ev;
        }
        if (hasK && ev > bestKEv) {
          bestK = [a, b];
          bestKEv = ev;
        }
      }
    }
    const chosen = bestK && bestEv - bestKEv <= 0.04 ? bestK : best;
    if (chosen) {
      tryAdd(chosen[0], false);
      tryAdd(chosen[1], false);
    }
    return picked.slice(0, size);
  }

  if (flavor === "power") {
    const ks = ranked.filter(
      (l) =>
        l.market === "k" &&
        !exclude.has(l.playerId) &&
        ((l.oddsType === "standard" && l.cover >= 0.52) || (l.oddsType === "demon" && l.cover >= 0.68)),
    );
    for (const k of ks) {
      if (picked.length >= size) break;
      tryAdd(k, false);
    }
  } else if (flavor === "core") {
    const k = ranked.find((l) => l.market === "k" && l.cover >= 0.55 && !exclude.has(l.playerId));
    if (k) tryAdd(k, false);
  }

  while (picked.length < size) {
    const strict = pickBest(false);
    if (strict && tryAdd(strict, false)) continue;
    if (flavor === "power") break;
    const loose = pickBest(true);
    if (loose && tryAdd(loose, true)) continue;
    break;
  }
  return picked.slice(0, size);
}

function slipOf(size: 2 | 3 | 6, legs: LegCandidate[], date: string): SlipCard {
  const title = size === 2 ? "Power 2" : size === 3 ? "Core 3" : "Flex 6";
  const conf = Math.round((legs.reduce((s, l) => s + l.cover, 0) / Math.max(legs.length, 1)) * 100);
  const kind = size === 6 ? "flex" : "power";
  const ev = legs.length >= 2 ? pricedReturn(kind, asEv(legs)) : 1;
  const be = breakEvenCover(kind, size);
  const covers = legs.map((l) => `${Math.round(l.cover * 100)}%`).join(" / ");
  const base =
    size === 2
      ? "Ks, 0.5 contact, 0.5 runs, and non-juice fantasy. 1.5 counting stays off Power."
      : size === 3
        ? "K-led core. One quality 1.5 allowed. Skip rather than fill with leftovers."
        : "Flex posts at 1.03x. Two juice lines max. Standard 0.5 HR stays off.";
  const notes = `${base} EV ${ev.toFixed(2)}x (${covers} · need ${Math.round(be * 100)}% · ${sizeLabel(sizeOf(ev))}).`;
  return {
    size,
    title,
    date,
    confidence: conf,
    lean: leanFrom(conf) as Lean,
    legs: legs.map(({ opener: _o, ...leg }) => leg),
    notes,
  };
}

function slipClears(slip: SlipCard): boolean {
  if (slip.legs.length < slip.size) return false;
  const kind = slip.size === 6 ? "flex" : "power";
  const ev = pricedReturn(kind, asEv(slip.legs as LegCandidate[]));
  const mean = slip.legs.reduce((s, l) => s + l.cover, 0) / slip.legs.length;
  const minEv = slip.size === 2 ? 1.02 : slip.size === 3 ? 1.03 : 1.03;
  const minMean = slip.size === 2 ? 0.56 : slip.size === 3 ? 0.52 : 0.5;
  return ev >= minEv && mean >= minMean;
}

function skipSlip(size: 2 | 3 | 6, date: string): SlipCard {
  const title = size === 2 ? "Power 2" : size === 3 ? "Core 3" : "Flex 6";
  const notes =
    size === 2
      ? "No pair cleared 1.02x on Ks, 0.5 contact, or 0.5 runs. Skip — not a loss."
      : size === 3
        ? "No three-leg core cleared 1.03x without leftover juice. Skip — not a loss."
        : "Flex needs six legs at 1.03x. The desk will not fill with 1.5 leftovers. Skip — not a loss.";
  return {
    size,
    title,
    date,
    confidence: 0,
    lean: "spec",
    legs: [],
    notes,
    skip: true,
  };
}

export function buildSlips(
  batters: BatterPick[],
  pitchers: PitcherPick[],
  date: string,
  books: BookProp[] = [],
): SlipCard[] {
  const pool = collectLegs(batters, pitchers, books);
  const two = greedy(pool, 2, new Set(), "power");
  const used = new Set(two.map((l) => l.playerId));
  const three = greedy(pool, 3, used, "core");
  for (const l of three) used.add(l.playerId);
  const six = greedy(pool, 6, used, "flex");
  const posted = [
    slipOf(2, two, date),
    slipOf(3, three, date),
    slipOf(6, six, date),
  ];
  return posted.map((card) => (slipClears(card) ? card : skipSlip(card.size, date)));
}

function actualOf(leg: SlipLeg, box: BoxActual | undefined): number | null {
  if (!box) return null;
  if (leg.market === "k") return box.pitcherK;
  if (leg.market === "hr") return box.hr;
  if (leg.market === "hits") return box.hits;
  if (leg.market === "tb") return box.tb;
  if (leg.market === "rbi") return box.rbi;
  if (leg.market === "sb") return box.sb;
  if (leg.market === "runs") return box.runs;
  if (leg.market === "hrrbi") return box.hits + box.runs + box.rbi;
  if (leg.market === "fs") return box.tb + box.runs + box.rbi + box.sb + (box.walks ?? 0);
  return null;
}

function resultOf(leg: SlipLeg, box: BoxActual | undefined): LegResult {
  if (!box) return "pending";
  if (leg.market !== "k" && box.pa <= 0 && box.pitcherK <= 0) {
    return box.inProgress ? "pending" : "dnp";
  }
  if (leg.market === "k" && box.inProgress && box.pitcherK === 0 && box.pa <= 0) {
    return "pending";
  }
  const value = actualOf(leg, box);
  if (value == null) return "pending";
  const hit = leg.side === "over" ? value > leg.line : value < leg.line;
  return hit ? "hit" : "miss";
}

export function gradeSlips(
  slips: SlipCard[],
  actuals: Map<number, BoxActual>,
  opts?: { complete?: boolean },
): { slips: SlipCard[]; grade: { hits: number; n: number; dnp: number; summary: string } | null } {
  const graded = slips.map((slip) => ({
    ...slip,
    legs: slip.legs.map((leg) => {
      const box = actuals.get(leg.playerId);
      let result = resultOf(leg, box);
      let actual = actualOf(leg, box);
      if (opts?.complete && (result === "pending" || !result)) {
        result = "dnp";
        actual = actual ?? 0;
      }
      return { ...leg, result, actual };
    }),
  }));
  const decided = graded.flatMap((s) => s.legs).filter((l) => l.result === "hit" || l.result === "miss" || l.result === "dnp");
  if (!decided.length) return { slips: graded, grade: null };
  const hits = decided.filter((l) => l.result === "hit").length;
  const dnp = decided.filter((l) => l.result === "dnp").length;
  const n = decided.filter((l) => l.result === "hit" || l.result === "miss").length;
  const smash = decided.filter((l) => l.result === "hit").slice(0, 2);
  const summary =
    n === 0
      ? `${dnp} did not play.`
      : `${hits}/${n} cleared${dnp ? ` · ${dnp} DNP` : ""}${smash.length ? ` · ${smash.map((l) => l.name.split(" ").slice(-1)[0]).join(", ")} hit` : ""}.`;
  return { slips: graded, grade: { hits, n, dnp, summary } };
}
