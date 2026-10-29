import { RZM, coverOver, fantasyPoints } from "./score.ts";
import type { LegResult, NflActual, NflLeg, NflMarket, NflPick, NflQuote, NflSlip, OddsType } from "./types.ts";

const COUNTING: NflMarket[] = ["pass", "rush", "recyd", "rec"];

/**
 * Oct 12, Rams-Bills. Josh Allen's pass line sat close to his mean and he
 * finished 32 yards short of it. A posted number on the projection is not a
 * cash leg. The over has to still be a favorite after that kind of night.
 */
export const ALLEN = {
  passYards: 26,
  recYards: 20,
  rushYards: 12,
  receptions: 1.5,
  minAfter: 0.55,
  /** Passing yards one implied point can carry. Chiefs were implied near 20 on Oct 25 and the 216.5 over finished at 165. */
  passPerPoint: 9.2,
} as const;

/**
 * Filter retune. The +2 catch spike was fit to one 5-catch winner and
 * it silenced the only shaded market that clears a juiced price.
 * One extra catch separates a 4.5 (no room) from a 5.5 (a catch to spare).
 * Pass unders need 64 yards of room, not 55: the 55-yard cut was a push
 * once the under is priced at -125. Receiving-yard overs need 26 yards
 * of room; 18 still let a coin-flip over onto the card.
 */
export const VOLUME = {
  qbRushKeep: 0.55,
  passYards: 64,
  recYards: 22,
  rushYards: 15,
  receptions: 1,
  maxOverAfter: 0.46,
} as const;

export function shockedMean(market: NflMarket, projection: number, pos = ""): number {
  if (market === "pass") return projection - ALLEN.passYards;
  if (market === "recyd") return projection - ALLEN.recYards;
  if (market === "rush" && pos === "QB") return projection * VOLUME.qbRushKeep;
  if (market === "rush") return projection - ALLEN.rushYards;
  if (market === "rec") return projection - ALLEN.receptions;
  return projection;
}

export function survivesShock(market: NflMarket, projection: number, line: number, pos: string, implied = 0): boolean {
  if (market === "atd" || market === "passtd" || market === "fant") return false;
  if (market === "pass" && implied > 0 && line > implied * ALLEN.passPerPoint) return false;
  const mean = shockedMean(market, projection, pos);
  if (!(mean > 0) || !(line > 0)) return false;
  if (market === "rec") return coverOver(mean, line, "count") >= ALLEN.minAfter;
  return coverOver(mean, line, "yards", cvOf(market, pos)) >= ALLEN.minAfter;
}

export function marketLabel(market: NflMarket): string {
  switch (market) {
    case "atd":
      return "Anytime TD";
    case "pass":
      return "Pass yds";
    case "rush":
      return "Rush yds";
    case "recyd":
      return "Rec yds";
    case "rec":
      return "Receptions";
    case "passtd":
      return "Pass TDs";
    case "fant":
      return "Fantasy";
  }
}

export function projectionOf(pick: NflPick, market: NflMarket): number {
  switch (market) {
    case "atd":
      return pick.lambda;
    case "pass":
      return pick.expPassYd;
    case "rush":
      return pick.expRushYd;
    case "recyd":
      return pick.expRecYd;
    case "rec":
      return pick.expRec;
    case "passtd":
      return pick.expPassTd;
    case "fant":
      return pick.expFantasy;
  }
}

export function cvOf(market: NflMarket, pos: string): number {
  if (market === "pass") return RZM.cvPass;
  if (market === "rush") return pos === "QB" ? RZM.cvRushQb : RZM.cvRush;
  if (market === "recyd") return RZM.cvRecYd;
  if (market === "fant") return pos === "QB" ? RZM.cvFantasyQb : RZM.cvFantasySkill;
  return 0.45;
}

/** Mean on a hot night. The under has to beat this, not the season rate. */
export function spikedMean(market: NflMarket, projection: number): number {
  if (market === "pass") return projection + VOLUME.passYards;
  if (market === "recyd") return projection + VOLUME.recYards;
  if (market === "rush") return projection + VOLUME.rushYards;
  if (market === "rec") return projection + VOLUME.receptions;
  return projection;
}

export function survivesSpike(market: NflMarket, projection: number, line: number, pos: string): boolean {
  if (market === "atd" || market === "passtd" || market === "fant") return false;
  const mean = spikedMean(market, projection);
  if (!(mean > 0) || !(line > 0) || !(mean < line)) return false;
  const cover = market === "rec" ? coverOver(mean, line, "count") : coverOver(mean, line, "yards", cvOf(market, pos));
  return cover <= VOLUME.maxOverAfter;
}

export function quoteCover(pick: NflPick, market: NflMarket, line: number): number {
  const mean = projectionOf(pick, market);
  if (market === "rec") return coverOver(mean, line, "count");
  if (market === "atd" || market === "passtd") return coverOver(mean, line, "td");
  // A player with no catch (or no carry) has zero yards, and the lognormal has no mass at zero.
  // Price the yards as P(at least one) times the survival of the yards given at least one.
  const zero = market === "recyd" ? Math.exp(-Math.max(0, pick.expRec)) : market === "rush" ? Math.exp(-Math.max(0, pick.expRushAtt)) : 0;
  const live = 1 - zero;
  if (!(live > 0)) return 0;
  return live * coverOver(mean / live, line, "yards", cvOf(market, pick.pos));
}

export function actualOf(market: NflMarket, actual: NflActual | null): number | null {
  if (!actual?.played) return null;
  switch (market) {
    case "atd":
      return actual.rushTd + actual.recTd;
    case "pass":
      return actual.passYd;
    case "rush":
      return actual.rushYd;
    case "recyd":
      return actual.recYd;
    case "rec":
      return actual.rec;
    case "passtd":
      return actual.passTd;
    case "fant":
      return fantasyPoints({
        passYd: actual.passYd,
        passTd: actual.passTd,
        ints: actual.ints,
        rushYd: actual.rushYd,
        rushTd: actual.rushTd,
        rec: actual.rec,
        recYd: actual.recYd,
        recTd: actual.recTd,
      });
  }
}

export function gradeLeg(market: NflMarket, line: number, actual: number | null, state: NflPick["gameState"]): LegResult {
  if (actual == null) return state === "post" ? "dnp" : "pending";
  const need = Math.floor(line) + 1;
  const cleared = market === "atd" || market === "passtd" || market === "rec" ? actual >= need : actual > line;
  if (cleared) return "hit";
  if (state === "post") return "miss";
  return "pending";
}

type Cand = {
  pick: NflPick;
  quote: NflQuote;
};

function clash(a: Cand, b: Cand): boolean {
  if (a.pick.id === b.pick.id) return true;
  if (a.pick.team !== b.pick.team) return false;
  const markets = new Set([a.quote.market, b.quote.market]);
  if (markets.has("pass") && (markets.has("recyd") || markets.has("rec") || markets.has("passtd"))) return true;
  if (markets.has("passtd") && markets.has("atd")) return true;
  if (markets.has("atd") && markets.has("rush") && a.pick.pos === "RB" && b.pick.pos === "RB") return true;
  return false;
}

function oddsPenalty(odds: OddsType): number {
  if (odds === "demon") return 0.05;
  if (odds === "goblin") return 0.02;
  return 0;
}

function sane(quote: NflQuote, pos: string, implied = 0): boolean {
  if (quote.line <= 0) return false;
  if (!survivesShock(quote.market, quote.projection, quote.line, pos, implied)) return false;
  if (quote.market === "pass") return quote.oddsType === "standard" && quote.line >= 149 && quote.line <= 320 && quote.cover >= 0.62 && quote.cover <= 0.93;
  if (quote.market === "rush") return quote.oddsType === "standard" && quote.line >= 25 && quote.line <= 120 && quote.cover >= 0.62 && quote.cover <= 0.93;
  if (quote.market === "recyd") return quote.oddsType === "standard" && quote.line >= 12 && quote.line <= 120 && quote.cover >= 0.62 && quote.cover <= 0.93;
  if (quote.market === "rec") return quote.oddsType === "standard" && quote.line >= 1.5 && quote.line <= 8.5 && quote.cover >= 0.62 && quote.cover <= 0.93;
  return false;
}

function candidates(picks: NflPick[]): Cand[] {
  const out: Cand[] = [];
  for (const pick of picks) {
    for (const quote of pick.quotes) {
      if (!sane(quote, pick.pos, pick.implied)) continue;
      out.push({ pick, quote });
    }
  }
  const best = new Map<string, Cand>();
  for (const c of out) {
    const key = `${c.pick.id}:${c.quote.market}`;
    const prev = best.get(key);
    const score = c.quote.cover - oddsPenalty(c.quote.oddsType);
    const prevScore = prev ? prev.quote.cover - oddsPenalty(prev.quote.oddsType) : -1;
    if (!prev || score > prevScore) best.set(key, c);
  }
  return [...best.values()].sort(
    (a, b) => b.quote.cover - oddsPenalty(b.quote.oddsType) - (a.quote.cover - oddsPenalty(a.quote.oddsType)),
  );
}

function powerEv(probs: number[]): number {
  const mult = probs.length === 2 ? 3 : probs.length === 3 ? 6 : 0;
  return mult * probs.reduce((p, x) => p * x, 1);
}

function flexEv(probs: number[]): number {
  const n = probs.length;
  if (n !== 6) return 0;
  let ev = 0;
  const masks = 1 << n;
  for (let mask = 0; mask < masks; mask++) {
    let p = 1;
    let hits = 0;
    for (let i = 0; i < n; i++) {
      const hit = (mask >> i) & 1;
      p *= hit ? probs[i]! : 1 - probs[i]!;
      hits += hit;
    }
    const mult = hits === 6 ? 25 : hits === 5 ? 2 : hits === 4 ? 0.4 : 0;
    ev += p * mult;
  }
  return ev;
}

function combos<T>(arr: T[], k: number): T[][] {
  const out: T[][] = [];
  const walk = (start: number, acc: T[]) => {
    if (acc.length === k) {
      out.push([...acc]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      acc.push(arr[i]!);
      walk(i + 1, acc);
      acc.pop();
    }
  };
  walk(0, []);
  return out;
}

function legal(group: Cand[], opts: { maxPerGame: number; differentGames?: boolean }): boolean {
  const games = new Map<string, number>();
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      if (clash(group[i]!, group[j]!)) return false;
    }
    const id = group[i]!.pick.gameId;
    games.set(id, (games.get(id) ?? 0) + 1);
  }
  if (opts.differentGames && games.size !== group.length) return false;
  for (const n of games.values()) if (n > opts.maxPerGame) return false;
  return true;
}

function toLeg(c: Cand): NflLeg {
  const actual = actualOf(c.quote.market, c.pick.actual);
  return {
    playerId: c.pick.id,
    name: c.pick.name,
    team: c.pick.team,
    opp: c.pick.opp,
    pos: c.pick.pos,
    market: c.quote.market,
    stat: c.quote.stat,
    line: c.quote.line,
    cover: c.quote.cover,
    projection: c.quote.projection,
    actual,
    result: gradeLeg(c.quote.market, c.quote.line, actual, c.pick.gameState),
  };
}

function slip(size: 2 | 3 | 6, title: string, group: Cand[] | null, skipNote: string): NflSlip {
  if (!group) {
    return { size, title, notes: skipNote, skip: true, legs: [] };
  }
  const probs = group.map((c) => c.quote.cover);
  const ev = size === 6 ? flexEv(probs) : powerEv(probs);
  const names = group.map((c) => `${c.pick.name.split(" ").slice(-1)[0]} ${marketLabel(c.quote.market)} ${c.quote.line}`).join(" · ");
  return {
    size,
    title,
    notes: `${names}. Still a favorite after the Allen shock. Model EV ${ev.toFixed(2)}×.`,
    skip: false,
    legs: group.map(toLeg),
  };
}

export function buildSlips(picks: NflPick[], lineCount: number): NflSlip[] {
  const emptyNote =
    lineCount === 0
      ? "No PrizePicks board — skip, not a loss. The Goal Line is the card."
      : "No line is still a favorite after a 32-yard drop. Skip, not a loss.";
  const pool = candidates(picks).slice(0, 14);
  const counting = pool.filter((c) => COUNTING.includes(c.quote.market));

  let power: Cand[] | null = null;
  let bestPower = 1.03;
  for (const group of combos(counting.slice(0, 10), 2)) {
    if (!legal(group, { maxPerGame: 1, differentGames: true })) continue;
    const ev = powerEv(group.map((c) => c.quote.cover));
    if (ev >= bestPower) {
      bestPower = ev;
      power = group;
    }
  }

  let core: Cand[] | null = null;
  let bestCore = 1.04;
  for (const group of combos(pool.slice(0, 9), 3)) {
    if (!legal(group, { maxPerGame: 2 })) continue;
    const ev = powerEv(group.map((c) => c.quote.cover));
    if (ev >= bestCore) {
      bestCore = ev;
      core = group;
    }
  }

  let flex: Cand[] | null = null;
  let bestFlex = 1.04;
  const flexPool = pool.slice(0, 11);
  if (flexPool.length >= 6) {
    for (const group of combos(flexPool, 6)) {
      if (!legal(group, { maxPerGame: 2 })) continue;
      const ev = flexEv(group.map((c) => c.quote.cover));
      if (ev >= bestFlex) {
        bestFlex = ev;
        flex = group;
      }
    }
  }

  return [
    slip(2, "Power 2", power, emptyNote),
    slip(3, "Core 3", core, emptyNote),
    slip(6, "Flex 6", flex, emptyNote),
  ];
}
