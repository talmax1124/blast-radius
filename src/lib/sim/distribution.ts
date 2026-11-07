import { makeRng } from "./rng.ts";
import { newNbaState, playNba, type NbaStat } from "./nba.ts";
import { newNflState, playNfl, type NflStat } from "./nfl.ts";
import type { SimGame } from "./ticket.ts";

/**
 * The whole game's spread of outcomes: every player's every stat and the score, as integer histograms.
 * This is what a box score looks like across many replays, to set next to the real one.
 */

/** Integer histogram over [min, max]; values outside are clamped to the ends. */
export class Hist {
  readonly min: number;
  readonly max: number;
  readonly counts: Int32Array;
  n = 0;
  sum = 0;
  constructor(min: number, max: number) {
    this.min = min;
    this.max = max;
    this.counts = new Int32Array(max - min + 1);
  }
  add(v: number): void {
    const b = Math.min(this.max, Math.max(this.min, Math.round(v)));
    this.counts[b - this.min] += 1;
    this.n += 1;
    this.sum += v;
  }
  quantile(q: number): number {
    const target = q * this.n;
    let run = 0;
    for (let i = 0; i < this.counts.length; i++) {
      run += this.counts[i];
      if (run >= target) return i + this.min;
    }
    return this.max;
  }
  /** Share of replays below `v`, counting a tie as half. Where the real result landed in the sim. */
  percentile(v: number): number {
    const b = Math.min(this.max, Math.max(this.min, Math.round(v))) - this.min;
    let below = 0;
    for (let i = 0; i < b; i++) below += this.counts[i];
    return (below + this.counts[b] / 2) / Math.max(1, this.n);
  }
  summary(): Spread {
    let lo = 0;
    while (lo < this.counts.length - 1 && this.counts[lo] === 0) lo++;
    let hi = this.counts.length - 1;
    while (hi > lo && this.counts[hi] === 0) hi--;
    return {
      mean: this.sum / Math.max(1, this.n),
      q10: this.quantile(0.1),
      q25: this.quantile(0.25),
      q50: this.quantile(0.5),
      q75: this.quantile(0.75),
      q90: this.quantile(0.9),
      min: lo + this.min,
      counts: Array.from(this.counts.slice(lo, hi + 1)),
      n: this.n,
    };
  }
}

export type Spread = { mean: number; q10: number; q25: number; q50: number; q75: number; q90: number; min: number; counts: number[]; n: number };

const NBA_RANGE: Record<NbaStat | "pra", [number, number]> = { pts: [0, 90], reb: [0, 35], ast: [0, 30], threes: [0, 16], min: [0, 48], pra: [0, 120] };
const NFL_RANGE: Record<NflStat | "td" | "rushRecYd", [number, number]> = {
  passYd: [0, 650], passTd: [0, 8], rushAtt: [0, 45], rushYd: [-15, 300], rushTd: [0, 5], targets: [0, 25], rec: [0, 20], recYd: [0, 300], recTd: [0, 5], td: [0, 5], rushRecYd: [-15, 400],
};

export type PlayerSpread = { name: string; team: string; stats: Record<string, Spread> };
export type GameSpread = { sims: number; home: Spread; away: Spread; total: Spread; homeMargin: Spread; homeWin: number; players: PlayerSpread[] };

export function simulateGame(sg: SimGame, opts: { sims?: number; seed?: number; onProgress?: (done: number) => void } = {}): GameSpread {
  const sims = opts.sims ?? 100_000;
  const rng = makeRng(opts.seed ?? 7);
  const score = { home: new Hist(0, 200), away: new Hist(0, 200), total: new Hist(0, 400), margin: new Hist(-80, 80) };
  let homeWins = 0;
  const g = sg.game;
  if (sg.sport === "nba") {
    const keys = Object.keys(NBA_RANGE) as (NbaStat | "pra")[];
    const hists = g.players.map(() => Object.fromEntries(keys.map((k) => [k, new Hist(...NBA_RANGE[k])])) as Record<string, Hist>);
    const st = newNbaState(sg.game);
    for (let k = 0; k < sims; k++) {
      if (opts.onProgress && k % 20_000 === 0) opts.onProgress(k);
      playNba(sg.game, rng, st);
      tally(st.homePts, st.awayPts);
      for (let i = 0; i < g.players.length; i++) {
        const h = hists[i];
        h.pts.add(st.stat.pts[i]);
        h.reb.add(st.stat.reb[i]);
        h.ast.add(st.stat.ast[i]);
        h.threes.add(st.stat.threes[i]);
        h.min.add(st.stat.min[i]);
        h.pra.add(st.stat.pts[i] + st.stat.reb[i] + st.stat.ast[i]);
      }
    }
    return finish(hists);
  }
  const keys = Object.keys(NFL_RANGE) as (NflStat | "td" | "rushRecYd")[];
  const hists = g.players.map(() => Object.fromEntries(keys.map((k) => [k, new Hist(...NFL_RANGE[k])])) as Record<string, Hist>);
  const st = newNflState(sg.game);
  for (let k = 0; k < sims; k++) {
    if (opts.onProgress && k % 20_000 === 0) opts.onProgress(k);
    playNfl(sg.game, rng, st);
    tally(st.homePts, st.awayPts);
    for (let i = 0; i < g.players.length; i++) {
      const h = hists[i];
      const s = st.stat;
      for (const key of ["passYd", "passTd", "rushAtt", "rushYd", "rushTd", "targets", "rec", "recYd", "recTd"] as NflStat[]) h[key].add(s[key][i]);
      h.td.add(s.rushTd[i] + s.recTd[i]);
      h.rushRecYd.add(s.rushYd[i] + s.recYd[i]);
    }
  }
  return finish(hists);

  function tally(home: number, away: number) {
    score.home.add(home);
    score.away.add(away);
    score.total.add(home + away);
    score.margin.add(home - away);
    if (home > away) homeWins += 1;
  }
  function finish(hists: Record<string, Hist>[]): GameSpread {
    return {
      sims,
      home: score.home.summary(),
      away: score.away.summary(),
      total: score.total.summary(),
      homeMargin: score.margin.summary(),
      homeWin: homeWins / sims,
      players: g.players.map((p, i) => ({
        name: p.name,
        team: p.team,
        stats: Object.fromEntries(Object.entries(hists[i]).filter(([, h]) => h.sum !== 0 || h.counts[-h.min] !== h.n).map(([k, h]) => [k, h.summary()])),
      })),
    };
  }
}

/** Where a real value sits in a summarized spread: share of replays below it, a tie counting half. */
export function percentileOf(s: Spread, v: number): number {
  const b = Math.round(v) - s.min;
  let below = 0;
  for (let i = 0; i < Math.min(b, s.counts.length); i++) below += s.counts[i];
  const tie = b >= 0 && b < s.counts.length ? s.counts[b] / 2 : 0;
  return (below + tie) / Math.max(1, s.n);
}
