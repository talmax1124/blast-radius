import { NBA_SIM, type NbaGameIn, type NbaGameState } from "./nba.ts";
import { makeRng, type Rng } from "./rng.ts";

/**
 * An NBA game played possession by possession.
 *
 * Twelve-minute quarters split into three-minute stints; each stint puts five players a side on the
 * floor, weighted by their projected minutes and pulled toward the bench in a fourth-quarter blowout.
 * Each possession ends in a turnover, a trip to the line, or a two or a three from a player picked by
 * usage, with misses going to an offensive or defensive rebounder and made shots often assisted.
 * The weights are tuned per game so a player's averages over many games match his projection,
 * and each game draws a pace and a shooting night for each side so totals and margins vary like real ones.
 */

export type PlayEvent = {
  period: number;
  /** Seconds left in the period. */
  clock: number;
  team: string;
  text: string;
  away: number;
  home: number;
  /** Index into players, or -1 for a team event. */
  player: number;
  kind: "made" | "miss" | "ft" | "turnover" | "rebound" | "sub" | "period" | "drive" | "td" | "fg" | "punt" | "pass" | "run";
  /** Box-score changes this play made: [player index, stat, amount]. */
  credit?: [number, string, number][];
};

const LEAGUE = { ppp: 1.14, threeMake: 0.36, ftMake: 0.78, turnover: 0.13, foulTrip: 0.11, offReb: 0.26, assisted: 0.62 } as const;

/**
 * Game-to-game swing. Possession-by-possession luck alone already spreads margins wide, so the nightly
 * shooting draw is small, and a trailing side shoots a little better (and a leading one a little worse),
 * the way real games regress: urgency, coasting, and the other team's bench. Tuned so final margins
 * spread about 12.5 points around the spread, as NBA results do.
 */
export const PBP_SWING = { shootSd: 0.025, catchUp: 0.0045 } as const;
const STINTS_PER_PERIOD = 4;
const STINT_SECONDS = 180;

type Tune = { use: Float64Array; three: Float64Array; reb: Float64Array; ast: Float64Array; floor: Float64Array; twoMake: number; credit: [number, number]; edge: number };
const tunes = new WeakMap<NbaGameIn, Tune>();

function sideOf(game: NbaGameIn, i: number): 0 | 1 {
  return game.players[i].team === game.home ? 1 : 0;
}

function baseTune(game: NbaGameIn): Tune {
  const n = game.players.length;
  const t: Tune = { use: new Float64Array(n), three: new Float64Array(n), reb: new Float64Array(n), ast: new Float64Array(n), floor: new Float64Array(n), twoMake: 0.53, credit: [1, 1], edge: 1 };
  game.players.forEach((p, i) => {
    const m = Math.max(1, p.minutes);
    t.use[i] = Math.max(0.05, p.pts) / m;
    t.three[i] = Math.min(0.75, (p.threes / LEAGUE.threeMake) / Math.max(1, p.pts / 1.1));
    t.reb[i] = Math.max(0.02, p.reb) / m;
    t.ast[i] = Math.max(0.02, p.ast) / m;
    t.floor[i] = p.minutes;
  });
  return t;
}

/** Tune the weights so many games average each player's projection. Cached per game. */
function tuneOf(game: NbaGameIn): Tune {
  const cached = tunes.get(game);
  if (cached) return cached;
  const t = baseTune(game);
  const rng = makeRng(17);
  const st = emptyState(game.players.length);
  const n = game.players.length;
  const target = -game.spread;
  // Tune under the same randomness the real runs use, so blowouts (and the bench minutes they cause)
  // happen as often while tuning as they do when the ticket is priced.
  for (let round = 0; round < 8; round++) {
    const sum = { pts: new Float64Array(n), reb: new Float64Array(n), ast: new Float64Array(n), threes: new Float64Array(n), min: new Float64Array(n) };
    let teamPts = 0;
    let margin = 0;
    const games = 400;
    for (let g = 0; g < games; g++) {
      play(game, t, rng, st, null);
      teamPts += st.homePts + st.awayPts;
      margin += st.homePts - st.awayPts;
      for (let i = 0; i < n; i++) {
        sum.pts[i] += st.stat.pts[i];
        sum.reb[i] += st.stat.reb[i];
        sum.ast[i] += st.stat.ast[i];
        sum.threes[i] += st.stat.threes[i];
        sum.min[i] += st.stat.min[i];
      }
    }
    // The favorite's edge: pushed until the average margin sits on the spread.
    t.edge = Math.max(0.3, Math.min(3, t.edge + (target - margin / games) / Math.max(4, Math.abs(target) + 4) * 0.8 * Math.sign(target || 1)));
    const step = (target: number, got: number) => Math.pow(Math.max(0.05, target) / Math.max(0.05, got / games), 0.85);
    game.players.forEach((p, i) => {
      t.floor[i] *= step(p.minutes, sum.min[i]);
      t.use[i] *= step(p.pts, sum.pts[i]);
      t.three[i] = Math.min(0.8, t.three[i] * step(p.threes, sum.threes[i]));
      t.reb[i] *= step(p.reb, sum.reb[i]);
      t.ast[i] *= step(p.ast, sum.ast[i]);
    });
    t.twoMake = Math.min(0.68, Math.max(0.4, t.twoMake * Math.pow(game.total / Math.max(1, teamPts / games), 0.9)));
    // Not every miss lands with a player: some go out of bounds as team rebounds.
    for (const side of [0, 1] as const) {
      let want = 0;
      let got = 0;
      game.players.forEach((p, i) => {
        if (sideOf(game, i) !== side) return;
        want += p.reb;
        got += sum.reb[i] / games;
      });
      t.credit[side] = Math.min(1, Math.max(0.5, t.credit[side] * (want / Math.max(1, got))));
    }
  }
  tunes.set(game, t);
  return t;
}

function emptyState(n: number): NbaGameState {
  return { homePts: 0, awayPts: 0, stat: { pts: new Float64Array(n), reb: new Float64Array(n), ast: new Float64Array(n), threes: new Float64Array(n), min: new Float64Array(n) } };
}

function pick(rng: Rng, idx: number[], weight: (i: number) => number): number {
  let total = 0;
  for (const i of idx) total += weight(i);
  if (!(total > 0)) return idx[Math.floor(rng.next() * idx.length)] ?? -1;
  let r = rng.next() * total;
  for (const i of idx) {
    r -= weight(i);
    if (r <= 0) return i;
  }
  return idx[idx.length - 1];
}

/** Five on the floor per side for one stint, drawn without replacement by minutes weight. */
function lineup(rng: Rng, idx: number[], w: (i: number) => number): number[] {
  const pool = [...idx];
  const out: number[] = [];
  while (out.length < 5 && pool.length) {
    const i = pick(rng, pool, w);
    out.push(i);
    pool.splice(pool.indexOf(i), 1);
  }
  return out;
}

function clockText(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

function play(game: NbaGameIn, t: Tune, rng: Rng, out: NbaGameState, log: PlayEvent[] | null): void {
  const s = NBA_SIM;
  out.homePts = 0;
  out.awayPts = 0;
  for (const arr of Object.values(out.stat)) arr.fill(0);
  const teams: number[][] = [[], []];
  game.players.forEach((_, i) => teams[sideOf(game, i)].push(i));
  const names = [game.away, game.home];
  // The night: a pace and a shooting form for each side, drawn the way the fast model draws its margin and total.
  const pace = (game.total / (2 * LEAGUE.ppp)) * Math.exp(0.06 * rng.normal());
  const edge = (-game.spread / 2) * t.edge;
  const shoot = [0, 1].map((side) => {
    const want = game.total / 2 + (side === 1 ? edge : -edge);
    return Math.max(0.75, Math.min(1.25, (want / (game.total / 2)) * (1 + PBP_SWING.shootSd * rng.normal())));
  });
  const form = game.players.map(() => rng.gamma(s.formShape, 1 / s.formShape));
  const seconds = 4 * STINTS_PER_PERIOD * STINT_SECONDS;
  const perPossession = seconds / (2 * pace);
  let side: 0 | 1 = rng.next() < 0.5 ? 0 : 1;
  const score = [0, 0];
  const say = (period: number, clock: number, team: number, kind: PlayEvent["kind"], text: string, player = -1, credit?: [number, string, number][]) =>
    log?.push({ period, clock: Math.max(0, Math.round(clock)), team: names[team], text, away: score[0], home: score[1], player, kind, credit });

  for (let period = 1; period <= 4; period++) {
    say(period, 720, side, "period", `Start of the ${["1st", "2nd", "3rd", "4th"][period - 1]} quarter`);
    for (let stint = 0; stint < STINTS_PER_PERIOD; stint++) {
      const lead = Math.abs(score[1] - score[0]);
      const late = period === 4 && lead > s.blowoutAt;
      // A fourth-quarter blowout pulls the starters toward the bench.
      const w = (i: number) => t.floor[i] * (late && game.players[i].minutes >= s.starterMinutes ? Math.max(0.15, 1 - (lead - s.blowoutAt) * 0.06) : 1) * (rng.next() < s.shortNight / 16 ? 0.2 : 1);
      const floor = [lineup(rng, teams[0], w), lineup(rng, teams[1], w)];
      for (const f of floor) for (const i of f) out.stat.min[i] += STINT_SECONDS / 60;
      if (log && stint > 0) say(period, 720 - stint * STINT_SECONDS, 0, "sub", `Lineups: ${floor.map((f, k) => `${names[k]} ${f.map((i) => last(game.players[i].name)).join(", ")}`).join(" · ")}`);
      let clock = STINT_SECONDS;
      while (clock > 0) {
        const off = side;
        const def = (1 - side) as 0 | 1;
        clock -= perPossession * (0.6 + 0.8 * rng.next());
        const pclock = 720 - stint * STINT_SECONDS - (STINT_SECONDS - Math.max(0, clock));
        let more = true;
        while (more) {
          more = false;
          if (rng.next() < LEAGUE.turnover) {
            const who = pick(rng, floor[off], (i) => t.use[i]);
            say(period, pclock, off, "turnover", `${nm(who)} turns it over`, who);
            break;
          }
          const shooter = pick(rng, floor[off], (i) => t.use[i] * form[i]);
          if (shooter < 0) break;
          if (rng.next() < LEAGUE.foulTrip) {
            let made = 0;
            for (let k = 0; k < 2; k++) if (rng.next() < LEAGUE.ftMake) made++;
            score[off] += made;
            out.stat.pts[shooter] += made;
            say(period, pclock, off, "ft", `${nm(shooter)} makes ${made} of 2 free throws`, shooter, made ? [[shooter, "pts", made]] : undefined);
            break;
          }
          const three = rng.next() < t.three[shooter];
          const lag = Math.max(-0.12, Math.min(0.12, PBP_SWING.catchUp * (score[def] - score[off])));
          const make = (three ? LEAGUE.threeMake : t.twoMake) * shoot[off] * Math.sqrt(form[shooter]) * (1 + lag);
          if (rng.next() < Math.min(0.9, make)) {
            const pts = three ? 3 : 2;
            score[off] += pts;
            out.stat.pts[shooter] += pts;
            if (three) out.stat.threes[shooter] += 1;
            let assist = "";
            const credit: [number, string, number][] = [[shooter, "pts", pts]];
            if (three) credit.push([shooter, "threes", 1]);
            if (rng.next() < LEAGUE.assisted) {
              const mates = floor[off].filter((i) => i !== shooter);
              const a = pick(rng, mates, (i) => t.ast[i]);
              if (a >= 0) {
                out.stat.ast[a] += 1;
                assist = ` (${nm(a)} assists)`;
                credit.push([a, "ast", 1]);
              }
            }
            say(period, pclock, off, "made", `${nm(shooter)} makes a ${three ? "three" : "two"}${assist}`, shooter, credit);
          } else {
            say(period, pclock, off, "miss", `${nm(shooter)} misses a ${three ? "three" : "two"}`, shooter);
            const offensive = rng.next() < LEAGUE.offReb;
            const r = pick(rng, floor[offensive ? off : def], (i) => t.reb[i]);
            if (r >= 0 && rng.next() < t.credit[offensive ? off : def]) {
              out.stat.reb[r] += 1;
              say(period, pclock, offensive ? off : def, "rebound", `${offensive ? "Offensive" : "Defensive"} rebound, ${nm(r)}`, r, [[r, "reb", 1]]);
            }
            if (offensive) more = true;
          }
        }
        side = (1 - side) as 0 | 1;
      }
    }
  }
  // A tie goes to overtime: a five-minute session at the same pace with the starters on.
  let ot = 0;
  while (score[0] === score[1] && ot < 4) {
    ot++;
    for (let k = 0; k < Math.round(10 * (pace / 100)); k++) {
      const off = k % 2 === 0 ? side : ((1 - side) as 0 | 1);
      const shooter = pick(rng, teams[off], (i) => t.use[i] * t.floor[i]);
      if (shooter >= 0 && rng.next() < 0.5 * shoot[off]) {
        const pts = rng.next() < t.three[shooter] ? 3 : 2;
        score[off] += pts;
        out.stat.pts[shooter] += pts;
        if (pts === 3) out.stat.threes[shooter] += 1;
        say(4 + ot, 300 - k * 30, off, "made", `${nm(shooter)} scores ${pts} in overtime`, shooter, pts === 3 ? [[shooter, "pts", 3], [shooter, "threes", 1]] : [[shooter, "pts", 2]]);
      }
    }
    if (score[0] === score[1]) score[rng.next() < 0.5 ? 0 : 1] += 1;
  }
  out.awayPts = score[0];
  out.homePts = score[1];
  say(4 + ot, 0, 0, "period", `Final: ${game.away} ${score[0]}, ${game.home} ${score[1]}`);

  function nm(i: number) {
    return game.players[i]?.name ?? "Bench";
  }
}

function last(name: string): string {
  const parts = name.split(" ");
  return parts.length > 1 ? parts.slice(1).join(" ") : name;
}

const fulls = new WeakMap<NbaGameIn, NbaGameIn>();

/** Players kept whole when a roster's projected minutes overflow the 240 a team can play. */
export const ROTATION = 8;

/**
 * Projections often list more than 240 minutes for a team (thirteen players at 19+ minutes). Only 240
 * exist, and on a real night they go to the rotation first, so the overflow comes off the deep bench
 * (players past the top eight), and only then, if it must, off everyone in proportion. A player's
 * counting stats scale with the minutes he keeps. Without this, every player is cut alike and the
 * stars the props are about lose a quarter of their minutes.
 */
export function fitMinutes<T extends { name: string; team: string; minutes: number; pts: number; reb: number; ast: number; threes: number }>(list: T[], teams: string[]): T[] {
  const out = list.map((p) => ({ ...p }));
  for (const team of teams) {
    const mine = out.filter((p) => p.team === team).sort((a, b) => b.minutes - a.minutes);
    let excess = mine.reduce((s, p) => s + p.minutes, 0) - 240;
    if (excess <= 0) continue;
    const scale = (p: T, k: number) => {
      p.minutes *= k;
      p.pts *= k;
      p.reb *= k;
      p.ast *= k;
      p.threes *= k;
    };
    const deep = mine.slice(ROTATION);
    const deepMin = deep.reduce((s, p) => s + p.minutes, 0);
    if (deepMin > 0) {
      const k = Math.max(0, 1 - excess / deepMin);
      for (const p of deep) scale(p, k);
      excess -= deepMin * (1 - k);
    }
    if (excess > 0.5) {
      const total = mine.reduce((s, p) => s + p.minutes, 0);
      const k = 240 / total;
      for (const p of mine) scale(p, k);
    }
  }
  return out;
}

/**
 * A team's listed players rarely cover all 240 minutes (injuries, deep bench). The rest goes to one
 * bench player per side, carrying the team's leftover projected points at a reserve's rates, so the
 * listed players are not stretched to fill the night.
 */
function withBench(game: NbaGameIn): NbaGameIn {
  const cached = fulls.get(game);
  if (cached) return cached;
  const players = fitMinutes(game.players, [game.away, game.home]);
  const edge = -game.spread / 2;
  for (const team of [game.away, game.home]) {
    const mine = players.filter((p) => p.team === team);
    const minutes = 240 - mine.reduce((a, p) => a + p.minutes, 0);
    if (minutes < 4) continue;
    const want = game.total / 2 + (team === game.home ? edge : -edge);
    const pts = Math.max(minutes * 0.32, want - mine.reduce((a, p) => a + p.pts, 0));
    players.push({ name: `${team} bench`, team, minutes, pts, reb: minutes * 0.19, ast: minutes * 0.09, threes: minutes * 0.04 });
  }
  const full = { ...game, players };
  fulls.set(game, full);
  return full;
}

const scratch = new WeakMap<NbaGameIn, NbaGameState>();

/** Fill a game state possession by possession. Same state shape as the fast engine, so tickets read it alike. */
export function playNbaPbp(game: NbaGameIn, rng: Rng, out: NbaGameState): void {
  const full = withBench(game);
  let st = scratch.get(game);
  if (!st) {
    st = emptyState(full.players.length);
    scratch.set(game, st);
  }
  play(full, tuneOf(full), rng, st, null);
  out.homePts = st.homePts;
  out.awayPts = st.awayPts;
  for (const k of Object.keys(out.stat) as (keyof NbaGameState["stat"])[]) out.stat[k].set(st.stat[k].subarray(0, game.players.length));
}

/** One game with its full feed, for watching. Bench players appear in the feed as "<TEAM> bench". */
export function nbaPlayByPlay(game: NbaGameIn, seed: number): { state: NbaGameState; events: PlayEvent[]; players: string[] } {
  const full = withBench(game);
  const st = emptyState(full.players.length);
  const events: PlayEvent[] = [];
  play(full, tuneOf(full), makeRng(seed), st, events);
  return { state: st, events, players: full.players.map((p) => p.name) };
}

export { clockText };
