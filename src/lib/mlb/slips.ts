import { clamp } from "./parse";
import { expectedPa } from "./rotowire.server";
import { aceSuppress, hrDrought, isAcePitcher, isOpener, leanFrom } from "./score";
import type {
  BatterPick,
  Lean,
  LegResult,
  LineupStatus,
  PitcherPick,
  PropLine,
  PropMarket,
  SlipCard,
  SlipLeg,
} from "./types";
import { CHALK_SCORE } from "./types";

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

function juiceFloor(odds: PropLine["oddsType"]): number {
  if (odds === "demon") return 0.58;
  if (odds === "goblin") return 0.4;
  return 0.5;
}

export function coverProb(pick: BatterPick | PitcherPick, line: PropLine): number {
  const need = overNeed(line.line);
  if (pick.market === "k") {
    const p = pick as PitcherPick;
    const k9 = p.pitcher.recentK9 != null ? 0.52 * p.pitcher.k9 + 0.48 * p.pitcher.recentK9 : p.pitcher.k9;
    const ip =
      p.pitcher.recentIp && p.pitcher.recentIp >= 4
        ? clamp(p.pitcher.recentIp, 4.5, 6.3)
        : clamp(5.0 + p.pitcher.gamesStarted / 40, 4.6, 6.2);
    const parkAdj = (p.parkKFactor || 100) / 100;
    const oppAdj = clamp(0.88 + p.oppKRate * 0.55, 0.9, 1.12);
    const mean = ((k9 * ip) / 9) * parkAdj * oppAdj;
    const over = poissonAtLeast(need, mean);
    return line.side === "under" ? 1 - over : over;
  }

  const b = pick as BatterPick;
  const pa = expectedPa(b.lineupSlot || 5);
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
  });
  const rawSuppress = b.opener ? 1.08 : aceLive.factor;
  const onBase = pick.market === "hrrbi" || pick.market === "fs" || pick.market === "runs";
  const suppress = onBase ? (b.opener ? 1.08 : clamp(0.88 + 0.12 * rawSuppress, 0.9, 1.06)) : rawSuppress;
  const hitsAdj = clamp((b.edge?.pitcherVsHandHits9 ?? 8.4) / 8.5, 0.74, 1.16);
  const parkH = ((b.parkHrFactor || 100) + 100) / 200;
  const form =
    b.recent && b.recent.pa >= 16 ? clamp(b.recent.avg / Math.max(b.season.avg, 0.2), 0.72, 1.16) : 1;
  const mixTilt = clamp(b.dmgMult || 1, 0.78, 1.22);
  const recencyTilt = (b.flags ?? []).includes("hot") ? 1.06 : (b.flags ?? []).includes("cold") ? 0.94 : 1;

  let over = 0.5;
  if (pick.market === "hr") {
    const pHr = (b.impliedHr || (b.season.hr / Math.max(b.season.pa, 1)) * pa) * suppress;
    over = poissonAtLeast(need, Math.max(pHr, 0.04));
  } else if (pick.market === "hits") {
    const p = clamp((b.saber?.xba ?? b.season.avg) * hitsAdj * suppress * form * mixTilt * recencyTilt, 0.14, 0.38);
    over = binomAtLeast(need, ab, p);
  } else if (pick.market === "tb") {
    const tbG = b.season.tb / g;
    const recentTb = b.recent && b.recent.pa >= 16 ? b.recent.tb / Math.max(b.recent.pa / 4.15, 1) : tbG;
    const xTb = (b.saber?.xslg ?? b.season.slg) * ab;
    const mean = (0.7 * tbG + 0.18 * xTb + 0.12 * recentTb) * parkH * hitsAdj * suppress * form * mixTilt * recencyTilt;
    over = dispersedAtLeast(need, Math.max(mean, 0.35));
    if (line.line >= 1.5) over = 0.5 + 0.3 * (over - 0.5);
  } else if (pick.market === "rbi") {
    const mean = (b.season.rbi / g) * (pa / 4.15) * (b.lineupSlot >= 2 && b.lineupSlot <= 5 ? 1.06 : 0.9) * suppress * form * recencyTilt;
    over = dispersedAtLeast(need, Math.max(mean, 0.12));
  } else if (pick.market === "runs") {
    const mean = ((b.season.runs || 0) / g) * (pa / 4.15) * (b.lineupSlot <= 2 ? 1.08 : 0.95) * suppress * form * recencyTilt;
    over = dispersedAtLeast(need, Math.max(mean, 0.12));
  } else if (pick.market === "hrrbi") {
    const comboG = (b.season.hits + (b.season.runs || 0) + b.season.rbi) / g;
    const recentCombo =
      b.recent && b.recent.pa >= 16
        ? (b.recent.hits + b.recent.runs + b.recent.rbi) / Math.max(b.recent.pa / 4.15, 1)
        : comboG;
    const mean = (0.78 * comboG + 0.22 * recentCombo) * (pa / 4.15) * parkH * hitsAdj * suppress * form * mixTilt * recencyTilt;
    over = dispersedAtLeast(need, Math.max(mean, 0.5));
    if (line.line >= 1.5) over = 0.5 + 0.52 * (over - 0.5);
  } else if (pick.market === "fs") {
    const bbG = Math.max(b.season.obp - b.season.avg, 0.05) * 4.15;
    const fsG = b.season.tb / g + (b.season.runs || 0) / g + b.season.rbi / g + b.season.sb / g + bbG + 0.85;
    const slotBoost = b.lineupSlot <= 2 ? 1.12 : b.lineupSlot <= 5 ? 1.06 : 0.94;
    const mean = fsG * (pa / 4.15) * parkH * hitsAdj * suppress * form * mixTilt * recencyTilt * slotBoost;
    over = dispersedAtLeast(need, Math.max(mean, line.line * 0.7 + 1.4));
    if (line.line >= 7.5) over = 0.5 + 0.48 * (over - 0.5);
  } else {
    const mean = (b.season.sb / Math.max(b.season.pa / 4.1, 1)) * 0.85;
    over = poissonAtLeast(need, Math.max(mean, 0.05));
  }

  let cover = line.side === "under" ? 1 - over : over;
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
  return line >= 1.5 && (market === "tb" || market === "hits" || market === "hrrbi");
}

function damageVsAce(market: PropMarket): boolean {
  return market === "hr" || market === "tb" || market === "hits";
}

function facingAce(pick: BatterPick): boolean {
  if (pick.opener) return false;
  return isAcePitcher(pick.edge?.pitcherK9, pick.edge?.pitcherXera, pick.edge?.pitcherWhip);
}

export function collectLegs(batters: BatterPick[], pitchers: PitcherPick[]): LegCandidate[] {
  const out: LegCandidate[] = [];
  const seen = new Set<string>();
  const push = (pick: BatterPick | PitcherPick) => {
    const bump = (_why: string) => {};
    if (!pick.propLine) {
      bump("no line");
      return;
    }
    if (isBatter(pick) && !pick.inLineup && pick.lineupStatus !== "expected") {
      bump(`not in lineup (${pick.lineupStatus})`);
      return;
    }
    if ("gameState" in pick && (pick.gameState === "Final" || pick.gameState === "Live")) {
      bump(`state ${pick.gameState}`);
      return;
    }
    const line = pick.propLine;
    const counting = pick.market === "hrrbi" || pick.market === "fs" || pick.market === "runs";
    if (pick.score < (pick.market === "fs" ? 30 : 48)) {
      bump(`score ${pick.score}`);
      return;
    }
    if (!counting && pick.market !== "k" && pick.score < 54) {
      bump(`score ${pick.score}<54`);
      return;
    }
    if (pick.market === "k" && line.side === "under") return;
    if (pick.market === "k" && isOpener((pick as PitcherPick).pitcher)) return;
    if (isBatter(pick) && pick.season.pa < 80 && (pick.market === "hrrbi" || pick.market === "fs")) {
      bump(`pa ${pick.season.pa}<80`);
      return;
    }
    if (isBatter(pick) && pick.season.pa < 110 && pick.market !== "hr" && pick.market !== "sb" && pick.market !== "hrrbi" && pick.market !== "fs") {
      bump(`pa ${pick.season.pa}<110`);
      return;
    }
    if (pick.market === "runs" && isBatter(pick) && pick.season.pa < 120) {
      bump(`runs pa ${pick.season.pa}<120`);
      return;
    }
    if (line.line <= 0.5 && (pick.market === "tb" || pick.market === "hits") && line.side === "over" && pick.score < CHALK_SCORE) {
      bump("0.5 juice trap");
      return;
    }
    if (pick.market === "hrrbi" && line.line <= 0.5 && line.side === "over" && pick.score < 74) {
      bump("0.5 hrrbi");
      return;
    }
    if (pick.market === "k" && pick.score < 52) return;
    if (pick.market === "k" && line.line < 5.5) return;
    if (pick.market === "runs" && pick.score < 50) {
      bump("runs score");
      return;
    }
    if (isBatter(pick) && pick.market === "hr" && line.side === "over" && hrDrought(pick.recent)) {
      bump("drought");
      return;
    }
    if (isBatter(pick) && line.side === "over" && damageVsAce(pick.market) && facingAce(pick)) {
      bump("vs ace damage");
      return;
    }
    if (isBatter(pick) && juiceLine(pick.market, line.line) && line.side === "over") {
      if (pick.lineupSlot >= 7) {
        bump("slot 7+");
        return;
      }
      if ((pick.flags ?? []).includes("thin")) {
        bump("thin");
        return;
      }
      if (pick.recent && pick.recent.pa < 18) {
        bump(`thin pa ${pick.recent.pa}`);
        return;
      }
      if (pick.saber?.wrcPlus != null && pick.saber.wrcPlus < 92) {
        bump(`wrc ${pick.saber.wrcPlus}`);
        return;
      }
      if (pick.recent && pick.recent.pa >= 20 && pick.recent.avg < 0.18) {
        bump(`cold ${pick.recent.avg}`);
        return;
      }
      if (pick.score < 58) {
        bump(`juice score ${pick.score}`);
        return;
      }
    }
    let cover = coverProb(pick, line);
    const edge = cover - juiceFloor(line.oddsType);
    if (line.oddsType === "demon" && cover < 0.52) {
      bump(`demon cover ${cover.toFixed(3)}`);
      return;
    }
    if (line.oddsType === "standard" && line.side === "over" && pick.market === "k" && cover < 0.48) return;
    if (line.oddsType === "standard" && line.side === "over" && juiceLine(pick.market, line.line) && cover < (pick.market === "hrrbi" ? 0.52 : 0.54)) {
      bump(`juice cover ${cover.toFixed(3)} line ${line.line} ${line.oddsType}`);
      return;
    }
    if (line.oddsType === "standard" && line.side === "over" && pick.market === "fs" && cover < 0.47) {
      bump(`fs cover ${cover.toFixed(3)} line ${line.line}`);
      return;
    }
    if (line.oddsType === "standard" && line.side === "over" && pick.market !== "k" && pick.market !== "fs" && cover < 0.5) {
      bump(`cover ${cover.toFixed(3)}`);
      return;
    }
    if (line.oddsType === "goblin" && cover < 0.55) {
      bump(`goblin ${cover.toFixed(3)}`);
      return;
    }
    if (line.oddsType === "goblin" && pick.market === "hr") return;
    if (edge < -0.04) {
      bump(`edge ${edge.toFixed(3)}`);
      return;
    }
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
  power: ["k", "hr", "sb"],
  core: ["hrrbi", "fs", "runs", "hits"],
  flex: ["hrrbi", "fs", "tb", "runs", "rbi"],
};

function greedy(
  pool: LegCandidate[],
  size: 2 | 3 | 6,
  exclude: Set<number>,
  flavor: SlipFlavor,
): LegCandidate[] {
  const maxPerGame = size === 6 ? 2 : 1;
  const maxPerMarket = flavor === "power" ? 2 : size === 6 ? 4 : 3;
  const prefer = PREFER[flavor];
  const sorted = [...pool].sort((a, b) => {
      const ap = prefer.includes(a.market) ? 0.05 : 0;
      const bp = prefer.includes(b.market) ? 0.05 : 0;
      const aK = a.market === "k" ? 0.06 : 0;
      const bK = b.market === "k" ? 0.06 : 0;
      const aConf = a.lineupStatus === "confirmed" ? 0.03 : 0;
      const bConf = b.lineupStatus === "confirmed" ? 0.03 : 0;
      const aGob = a.oddsType === "goblin" ? -0.04 : 0;
      const bGob = b.oddsType === "goblin" ? -0.04 : 0;
      const aEx = exclude.has(a.playerId) ? -10 : 0;
      const bEx = exclude.has(b.playerId) ? -10 : 0;
      const aOp = a.opener && flavor !== "power" ? 0.04 : 0;
      const bOp = b.opener && flavor !== "power" ? 0.04 : 0;
      const aQ = 0.58 * a.edge + 0.42 * (a.score / 100) + ap + aK + aConf + aGob + aEx + aOp;
      const bQ = 0.58 * b.edge + 0.42 * (b.score / 100) + bp + bK + bConf + bGob + bEx + bOp;
      return bQ - aQ;
    });
  const ranked = sorted;
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
    const gKey = `${leg.playerId}:${leg.market}`;
    if (usedKey.has(gKey)) return true;
    if ((perGame.get(leg.gamePk) ?? 0) >= (flavor === "flex" && relax ? 3 : maxPerGame)) return true;
    if ((perMarket.get(leg.market) ?? 0) >= (relax ? maxPerMarket + 1 : maxPerMarket)) return true;
    if (flavor === "core" && leg.oddsType === "demon" && !relax) return true;
    if (flavor === "power" && leg.oddsType === "goblin") return true;
    if (flavor === "power" && leg.oddsType === "demon" && (leg.market !== "k" || leg.cover < 0.65)) return true;
    if (flavor === "power" && !relax && (leg.market === "hrrbi" || leg.market === "fs" || leg.market === "runs")) return true;
    if (flavor === "power" && !relax && leg.cover < 0.56 && leg.market !== "k") return true;
    if (flavor === "power" && juiceLine(leg.market, leg.line) && leg.side === "over" && leg.cover < (relax ? 0.54 : 0.58)) return true;
    if (flavor === "power" && (leg.market === "runs" || leg.market === "rbi") && leg.line <= 0.5 && leg.cover < 0.58) return true;
    if (flavor === "power" && !relax && leg.market !== "k" && leg.lineupStatus === "expected" && leg.score < 76) return true;
    if (flavor === "core" && juiceLine(leg.market, leg.line) && juiceCount() >= (relax ? 3 : 2)) return true;
    if (flavor === "flex" && juiceLine(leg.market, leg.line) && juiceCount() >= (relax ? 5 : 4)) return true;
    if (flavor === "core" && juiceLine(leg.market, leg.line) && leg.cover < (relax ? 0.56 : 0.58)) return true;
    if (flavor === "core" && !relax && leg.cover < 0.52 && leg.market !== "k") return true;
    if (flavor === "core" && !relax && leg.score < 56 && leg.market !== "k") return true;
    if (flavor === "flex" && !relax && leg.score < 54 && leg.market !== "k") return true;
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

  if (flavor === "power") {
    const ks = ranked.filter(
      (l) =>
        l.market === "k" &&
        !exclude.has(l.playerId) &&
        ((l.oddsType === "standard" && l.cover >= 0.5) || (l.oddsType === "demon" && l.cover >= 0.65)),
    );
    for (const k of ks) {
      if (picked.length >= size) break;
      tryAdd(k, false);
    }
  } else if (flavor === "core") {
    const wantCount = ranked.find(
      (l) =>
        (l.market === "hrrbi" || l.market === "fs" || l.market === "runs") &&
        l.oddsType === "standard" &&
        l.cover >= 0.55 &&
        !exclude.has(l.playerId) &&
        l.lineupStatus === "confirmed",
    );
    if (wantCount) tryAdd(wantCount, false);
    else {
      const any = ranked.find(
        (l) =>
          (l.market === "hrrbi" || l.market === "fs" || l.market === "runs") &&
          l.oddsType === "standard" &&
          l.cover >= 0.53 &&
          !exclude.has(l.playerId),
      );
      if (any) tryAdd(any, false);
    }
  }

  for (const leg of ranked) {
    if (picked.length >= size) break;
    tryAdd(leg, false);
  }
  if (picked.length < size) {
    for (const leg of ranked) {
      if (picked.length >= size) break;
      tryAdd(leg, true);
    }
  }
  return picked.slice(0, size);
}

function slipOf(size: 2 | 3 | 6, legs: LegCandidate[], date: string): SlipCard {
  const title = size === 2 ? "Power 2" : size === 3 ? "Core 3" : "Flex 6";
  const conf = Math.round((legs.reduce((s, l) => s + l.cover, 0) / Math.max(legs.length, 1)) * 100);
  const notes =
    size === 2
      ? "Highest calibrated cover. Leads with pitcher Ks. HR / hits / TB overs vs aces stay off this card."
      : size === 3
        ? "Counting core: H+R+RBI, fantasy score, runs. Standard lines only. Can sit vs an ace. Disjoint names from Power 2."
        : "Leftover names. Demons live here. Counting 1.5s can fill. Goblin unders vs aces can fill.";
  return {
    size,
    title,
    date,
    confidence: conf,
    lean: leanFrom(conf) as Lean,
    legs: legs.map(({ gamePk: _g, edge: _e, ...leg }) => leg),
    notes,
  };
}

export function buildSlips(batters: BatterPick[], pitchers: PitcherPick[], date: string): SlipCard[] {
  const pool = collectLegs(batters, pitchers);
  const two = greedy(pool, 2, new Set(), "power");
  const used = new Set(two.map((l) => l.playerId));
  const three = greedy(pool, 3, used, "core");
  for (const l of three) used.add(l.playerId);
  const six = greedy(pool, 6, used, "flex");
  return [slipOf(2, two, date), slipOf(3, three, date), slipOf(6, six, date)].filter((s) => s.legs.length >= Math.min(2, s.size));
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
  if (leg.market === "fs") return box.tb + box.runs + box.rbi + box.sb;
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

