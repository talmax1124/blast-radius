import { makeRng, type Rng } from "./rng.ts";

/**
 * One NHL game, played forward from its market lines and each player's projection.
 *
 * The draws are layered so the legs on a ticket move together the way they do on a real night:
 * - the game draws a shared pace and a form for each team, then plays the score out goal by goal in
 *   continuous time: a trailing team presses (score effects), a team down one or two late pulls its goalie,
 *   which brings both 6-on-5 tying goals and empty-netters. A tie after 60 minutes goes to five minutes of
 *   3-on-3 sudden death and then a shootout, and the winner gets one goal, as books and box scores count it;
 * - every goal (not the shootout winner) goes to one of the team's skaters in proportion to his goal rate
 *   times his form that night, and draws 0-2 assists from teammates in proportion to their assist rates,
 *   so a team's goals are exactly its skaters' goals, and a big team night lifts its scorers' points together;
 * - the team's shots that were not goals are the opposing starter's saves, and each skater's shots on goal
 *   are his goals plus a gamma-Poisson draw around his own shot rate, scaled by how many his team got that
 *   night. A skater's own input drives his own distribution: doubling his `sog` doubles his non-goal shots,
 *   it is not renormalized away by a team total (the failure the NFL engine had under anchoring).
 *
 * Calibrated so a league-average game (total 6.1, pick'em) gives about 6.1 goals, 29 shots a team, a .903
 * save percentage, 0.3 empty-net goals and 23% of games past regulation. Regular season rules only: a
 * playoff game would play sudden-death 5-on-5 overtime until a goal.
 */

export type NhlPlayerIn = {
  name: string;
  team: string;
  /** F (any forward), D or G. The first G listed for a team is its starter; other goalies record nothing. */
  pos: "F" | "D" | "G";
  /** Expected time on ice, minutes. Carried for adapters and roster checks; the engine does not use it yet. */
  toi?: number;
  /** Expected shots on goal (skaters), goals included. 0 for goalies. */
  sog: number;
  /** Expected goals. */
  goals: number;
  /** Expected assists. */
  assists: number;
  /** Expected points. Used only when goals and assists are both 0: split 40/60 (F) or 25/75 (D) into them. */
  points?: number;
  /** Expected blocked shots. Leave out to record none. */
  blocks?: number;
  /** Starter only: expected saves. Sets how many non-goal shots the opponent takes. */
  saves?: number;
  /** Starter only, used when `saves` is missing: expected shots faced, turned into saves with `savePct`. */
  shotsAgainst?: number;
  /** Starter only: save percentage, used with `shotsAgainst`. Goals come from the market, which already prices the goalie. */
  savePct?: number;
};

export type NhlGameIn = {
  home: string;
  away: string;
  /** Expected home goal margin with the spread's sign: -0.5 means the home side is half a goal better. Not the ±1.5 puck line. */
  spread: number;
  /** Expected total goals, overtime and the shootout goal included (how books settle totals). */
  total: number;
  /** Expected shots on goal per team. Optional; a starter's `saves` takes precedence, else a league-shaped default. */
  homeShots?: number;
  awayShots?: number;
  players: NhlPlayerIn[];
};

export type NhlStat = "goals" | "assists" | "points" | "sog" | "saves" | "blocks";
export const NHL_STATS: NhlStat[] = ["goals", "assists", "points", "sog", "saves", "blocks"];

/** One simulated game. Arrays are indexed like `players` and reused across draws. */
export type NhlGameState = {
  /** Final goals with overtime and the shootout winner's goal (named Pts to share the ticket's score plumbing). */
  homePts: number;
  awayPts: number;
  /** Shots on goal, overtime included, shootout excluded. Shots = goals − shootout goal + saves by the other starter. */
  homeShots: number;
  awayShots: number;
  homeEn: number;
  awayEn: number;
  /** 1 for the side that won the shootout. */
  homeSo: number;
  awaySo: number;
  /** 0 regulation, 1 overtime, 2 shootout. */
  ending: number;
  stat: Record<NhlStat, Float64Array>;
};

export const NHL_SIM = {
  leagueGoals: 3.05,
  leagueShots: 29.6,
  /** Better teams take a few more shots: team shots scale with expected goals to this power. */
  shotElasticity: 0.4,
  /** Gamma shapes of the game pace both teams share (about 10.5%) and each team's own night (about 18%). */
  paceShape: 90,
  teamShape: 30,
  /** Score effects on the goal rate: the trailing team is lifted, the leader sits back. */
  trailLift: 0.12,
  leadDrop: 0.06,
  /** Minutes left when a team down one / down two pulls its goalie. */
  pullDown1: 2.2,
  pullDown2: 3.3,
  /** Goal-rate multipliers with the net empty: the trailer's 6-on-5, and the leader into the empty net. */
  pulledFor: 2.4,
  pulledAgainst: 6,
  /** Combined 3-on-3 goal rate per minute in a league-average game (about 62% of overtimes end in a goal). */
  otRate: 0.19,
  otMinutes: 5,
  /** Shootout: how much of a team's strength edge carries into it (0 is a coin flip). */
  shootoutEdge: 0.4,
  /** Shots on goal per team per minute of 3-on-3. */
  otShots: 0.55,
  /** Shots on goal per team rise this much per unit of (share of regulation trailing − share leading). */
  shotScoreEffect: 0.18,
  /** Pace and team form reach shots at these powers (goals take them fully). */
  shotPacePow: 0.6,
  shotTeamPow: 0.5,
  /** Gamma shape of a team's own shooting night beyond pace and form: about 5%. */
  shotShape: 400,
  /** Nightly form of a skater, shared by his goals, shots and (by its square root) assists: about 26%. */
  formShape: 15,
  blockShape: 6,
  /** Assists on a goal: none, one, two. Mean 1.69, the league's assists per goal. */
  assist0: 0.07,
  assist1: 0.17,
} as const;

export function newNhlState(game: NhlGameIn): NhlGameState {
  const n = game.players.length;
  const arr = () => new Float64Array(n);
  return {
    homePts: 0,
    awayPts: 0,
    homeShots: 0,
    awayShots: 0,
    homeEn: 0,
    awayEn: 0,
    homeSo: 0,
    awaySo: 0,
    ending: 0,
    stat: { goals: arr(), assists: arr(), points: arr(), sog: arr(), saves: arr(), blocks: arr() },
  };
}

/** Expected goals for each side before overtime adjustments: the total split by the margin. */
export function nhlTeamGoals(game: Pick<NhlGameIn, "spread" | "total">): { home: number; away: number } {
  const total = Math.max(1, game.total);
  const edge = Math.max(-total + 0.4, Math.min(total - 0.4, -game.spread));
  return { home: (total + edge) / 2, away: (total - edge) / 2 };
}

// ---- the score ---------------------------------------------------------------------------------

/** Scratch space for one game's goals: who scored (0 home, 1 away) and whether into an empty net. */
type Score = {
  h: number;
  a: number;
  enH: number;
  enA: number;
  soH: number;
  soA: number;
  ending: number;
  otTime: number;
  /** Minutes of regulation each side spent trailing and leading. */
  trailH: number;
  trailA: number;
  pace: number;
  formH: number;
  formA: number;
  n: number;
  who: Int8Array;
};

function newScore(): Score {
  return { h: 0, a: 0, enH: 0, enA: 0, soH: 0, soA: 0, ending: 0, otTime: 0, trailH: 0, trailA: 0, pace: 1, formH: 1, formA: 1, n: 0, who: new Int8Array(64) };
}

/** Plays 60 minutes plus overtime and the shootout. `bH`, `bA` are per-minute goal rates before effects. */
function playScore(bH: number, bA: number, rng: Rng, sc: Score): void {
  const s = NHL_SIM;
  const tab = tablesOf();
  sc.pace = draw(tab.pace, rng);
  sc.formH = draw(tab.team, rng);
  sc.formA = draw(tab.team, rng);
  const baseH = bH * sc.pace * sc.formH;
  const baseA = bA * sc.pace * sc.formA;
  let h = 0;
  let a = 0;
  let t = 0;
  let n = 0;
  sc.enH = sc.enA = sc.soH = sc.soA = 0;
  sc.trailH = sc.trailA = 0;
  sc.otTime = 0;
  for (;;) {
    const d = h - a;
    const gap = Math.abs(d);
    const pullAt = gap === 1 ? 60 - s.pullDown1 : gap === 2 ? 60 - s.pullDown2 : 60;
    const pulled = gap > 0 && gap <= 2 && t >= pullAt;
    let rH = baseH;
    let rA = baseA;
    if (d > 0) {
      rH *= 1 - s.leadDrop;
      rA *= 1 + s.trailLift;
      if (pulled) { rH *= s.pulledAgainst; rA *= s.pulledFor; }
    } else if (d < 0) {
      rA *= 1 - s.leadDrop;
      rH *= 1 + s.trailLift;
      if (pulled) { rA *= s.pulledAgainst; rH *= s.pulledFor; }
    }
    const end = pulled || gap === 0 || gap > 2 ? 60 : pullAt;
    const r = rH + rA;
    const dt = -Math.log(1 - rng.next()) / r;
    const step = Math.min(dt, end - t);
    if (d > 0) sc.trailA += step;
    else if (d < 0) sc.trailH += step;
    if (t + dt >= end) {
      t = end;
      if (end >= 60) break;
      continue;
    }
    t += dt;
    const home = rng.next() * r < rH;
    if (n < sc.who.length) sc.who[n++] = home ? 0 : 1;
    if (home) {
      h += 1;
      if (pulled && d > 0) sc.enH += 1;
    } else {
      a += 1;
      if (pulled && d < 0) sc.enA += 1;
    }
  }
  sc.ending = 0;
  if (h === a) {
    const share = baseH / (baseH + baseA);
    const rate = s.otRate * ((bH + bA) * 60) / (2 * s.leagueGoals) * sc.pace;
    const dt = -Math.log(1 - rng.next()) / rate;
    if (dt < s.otMinutes) {
      sc.ending = 1;
      sc.otTime = dt;
      const home = rng.next() < share;
      if (n < sc.who.length) sc.who[n++] = home ? 0 : 1;
      if (home) h += 1;
      else a += 1;
    } else {
      sc.ending = 2;
      sc.otTime = s.otMinutes;
      if (rng.next() < 0.5 + s.shootoutEdge * (share - 0.5)) { h += 1; sc.soH = 1; }
      else { a += 1; sc.soA = 1; }
    }
  }
  sc.h = h;
  sc.a = a;
  sc.n = n;
}

/** Score-effect multiplier on a team's regulation shots: more when it trailed, fewer when it led. */
function shotAdj(trail: number, lead: number): number {
  return Math.max(0.5, 1 + NHL_SIM.shotScoreEffect * (trail - lead) / 60);
}

export type Calibration = {
  /** Multipliers on the per-minute goal rates so final goals (OT and shootout in) average the inputs. */
  cH: number;
  cA: number;
  /** Mean of the regulation shot multiplier (pace, form, score effects) and of overtime minutes × share, per side. */
  adjH: number;
  adjA: number;
  otH: number;
  otA: number;
  otRate: number;
  enRate: number;
  /** Share of games each side wins in a shootout: that goal is in the final score but credited to nobody. */
  soH: number;
  soA: number;
};

const calibrations = new Map<string, Calibration>();

/**
 * Score effects, empty nets and the overtime goal all add goals, so the raw rates are scaled until the
 * simulated final score averages the market's split. Cached by the split; a few thousand cheap games.
 */
export function nhlCalibration(muH: number, muA: number): Calibration {
  const key = `${muH.toFixed(4)}|${muA.toFixed(4)}`;
  const hit = calibrations.get(key);
  if (hit) return hit;
  const s = NHL_SIM;
  const sc = newScore();
  let cH = 1;
  let cA = 1;
  const draws = 30_000;
  let stats = { h: 0, a: 0, adjH: 0, adjA: 0, otH: 0, otA: 0, ot: 0, en: 0, soH: 0, soA: 0 };
  for (let round = 0; round < 3; round++) {
    const rng = makeRng(1234 + round);
    stats = { h: 0, a: 0, adjH: 0, adjA: 0, otH: 0, otA: 0, ot: 0, en: 0, soH: 0, soA: 0 };
    const bH = (muH * cH) / 60;
    const bA = (muA * cA) / 60;
    for (let k = 0; k < draws; k++) {
      playScore(bH, bA, rng, sc);
      stats.h += sc.h;
      stats.a += sc.a;
      // A side leads exactly when the other trails.
      stats.adjH += Math.pow(sc.pace, s.shotPacePow) * Math.pow(sc.formH, s.shotTeamPow) * shotAdj(sc.trailH, sc.trailA);
      stats.adjA += Math.pow(sc.pace, s.shotPacePow) * Math.pow(sc.formA, s.shotTeamPow) * shotAdj(sc.trailA, sc.trailH);
      const share = (bH * sc.formH) / (bH * sc.formH + bA * sc.formA);
      stats.otH += sc.otTime * 2 * share;
      stats.otA += sc.otTime * 2 * (1 - share);
      stats.ot += sc.ending > 0 ? 1 : 0;
      stats.en += sc.enH + sc.enA;
      stats.soH += sc.soH;
      stats.soA += sc.soA;
    }
    cH *= muH / Math.max(1e-9, stats.h / draws);
    cA *= muA / Math.max(1e-9, stats.a / draws);
  }
  const out: Calibration = {
    cH,
    cA,
    adjH: stats.adjH / draws,
    adjA: stats.adjA / draws,
    otH: stats.otH / draws,
    otA: stats.otA / draws,
    otRate: stats.ot / draws,
    enRate: stats.en / draws,
    soH: stats.soH / draws,
    soA: stats.soA / draws,
  };
  if (calibrations.size > 500) calibrations.clear();
  calibrations.set(key, out);
  return out;
}

// ---- the players -------------------------------------------------------------------------------

type Side = {
  /** Skater indexes into `players`. */
  idx: Int32Array;
  goalW: Float64Array;
  assistW: Float64Array;
  /** Mean non-goal shots and blocks per skater. */
  shotMean: Float64Array;
  blockMean: Float64Array;
  /** Weight of goals and assists that go to skaters not listed. */
  otherGoal: number;
  otherAssist: number;
  /** Index of the starting goalie, -1 when none is listed. */
  starter: number;
  /** Expected non-goal shots this team takes (the opposing starter's expected saves). */
  saves: number;
  mu: number;
};

type Plan = {
  /** What the plan was built from, to notice a game edited after the fact. */
  players: NhlPlayerIn[];
  n: number;
  spread: number;
  total: number;
  shots: string;
  home: Side;
  away: Side;
  cal: Calibration;
  /** Per-minute goal rates after calibration. */
  bH: number;
  bA: number;
  /** Each player's form this draw and its square root (assists move with the square root). */
  form: Float64Array;
  root: Float64Array;
};

const plans = new WeakMap<NhlGameIn, Plan>();

function num(v: number | undefined): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}

/** A skater's goals and assists, filled from `points` when only points were given. */
export function nhlGoalsAssists(p: NhlPlayerIn): { goals: number; assists: number } {
  const g = num(p.goals);
  const a = num(p.assists);
  const pts = num(p.points);
  if (g === 0 && a === 0 && pts > 0) {
    const share = p.pos === "D" ? 0.25 : 0.4;
    return { goals: pts * share, assists: pts * (1 - share) };
  }
  return { goals: g, assists: a };
}

/**
 * Drops what the engine has worked out for this game (rates, weights, scratch space) so the next draw reads
 * the inputs again. The engine caches per game object and notices a new players array or new lines by itself,
 * but not a player object edited in place, which is what centerOnLines does between rounds; simulateTicket
 * and simulateGame call this before they start.
 */
export function refreshNhl(game: NhlGameIn): void {
  plans.delete(game);
}

function planOf(game: NhlGameIn): Plan {
  const cached = plans.get(game);
  if (cached && cached.players === game.players && cached.n === game.players.length && cached.spread === game.spread && cached.total === game.total && cached.shots === `${game.homeShots}|${game.awayShots}`) return cached;
  const s = NHL_SIM;
  const mu = nhlTeamGoals(game);
  const cal = nhlCalibration(mu.home, mu.away);
  const side = (team: string, finalMu: number, opp: string): Side => {
    // Goals a skater can be credited with: the final score less the shootout goal.
    const teamMu = finalMu - (team === game.home ? cal.soH : cal.soA);
    const idx: number[] = [];
    let starter = -1;
    let oppStarter = -1;
    game.players.forEach((p, i) => {
      if (p.pos === "G") {
        if (p.team === team && starter < 0) starter = i;
        if (p.team === opp && oppStarter < 0) oppStarter = i;
      } else if (p.team === team) idx.push(i);
    });
    const goalW = new Float64Array(idx.length);
    const assistW = new Float64Array(idx.length);
    const shotMean = new Float64Array(idx.length);
    const blockMean = new Float64Array(idx.length);
    let gSum = 0;
    let aSum = 0;
    idx.forEach((i, k) => {
      const ga = nhlGoalsAssists(game.players[i]);
      goalW[k] = ga.goals;
      assistW[k] = ga.assists;
      gSum += ga.goals;
      aSum += ga.assists;
      blockMean[k] = num(game.players[i].blocks);
    });
    const assistsPerGoal = 2 - 2 * s.assist0 - s.assist1;
    const otherGoal = Math.max(0, teamMu - gSum);
    const otherAssist = Math.max(0, teamMu * assistsPerGoal - aSum);
    // A skater's expected goals once the team's split is applied; his non-goal shots make up the rest of his sog.
    const goalScale = gSum > 0 ? Math.min(1, teamMu / gSum) : 0;
    idx.forEach((i, k) => {
      shotMean[k] = Math.max(0, num(game.players[i].sog) - goalW[k] * goalScale);
    });
    const goalDen = Math.max(gSum, teamMu);
    const assistDen = Math.max(aSum, teamMu * assistsPerGoal);
    tuneAssists(
      goalW.map((w) => w / goalDen),
      assistW.map((w) => (assistsPerGoal * w) / assistDen),
      assistW,
      otherAssist,
    );
    const homeSide = team === game.home;
    const g = oppStarter >= 0 ? game.players[oppStarter] : null;
    let saves = 0;
    if (g && num(g.saves) > 0) saves = num(g.saves);
    else if (g && num(g.shotsAgainst) > 0) saves = num(g.shotsAgainst) * (num(g.savePct) || 0.903);
    else {
      const shots = num(homeSide ? game.homeShots : game.awayShots) || s.leagueShots * Math.pow(teamMu / s.leagueGoals, s.shotElasticity);
      saves = Math.max(5, shots - teamMu);
    }
    return { idx: Int32Array.from(idx), goalW, assistW, shotMean, blockMean, otherGoal, otherAssist, starter, saves, mu: teamMu };
  };
  const plan: Plan = {
    players: game.players,
    n: game.players.length,
    spread: game.spread,
    total: game.total,
    shots: `${game.homeShots}|${game.awayShots}`,
    home: side(game.home, mu.home, game.away),
    away: side(game.away, mu.away, game.home),
    cal,
    bH: (mu.home * cal.cH) / 60,
    bA: (mu.away * cal.cA) / 60,
    form: new Float64Array(game.players.length),
    root: new Float64Array(game.players.length),
  };
  plans.set(game, plan);
  return plan;
}

/**
 * Nobody assists his own goal, and the first assist cannot take the second, so drawing assists in
 * proportion to raw rates shorts the team's scorers (a 0.45-goal, 0.6-assist center came out at 0.56).
 * This solves for draw weights that give each skater his target assists per team goal, `target[k]`,
 * with the exclusions in. `w` holds the raw rates on entry and the draw weights on return.
 */
function tuneAssists(goalShare: Float64Array, target: Float64Array, w: Float64Array, other: number): void {
  const s = NHL_SIM;
  const n = w.length;
  const p1 = s.assist1;
  const p2 = 1 - s.assist0 - s.assist1;
  const otherGoal = Math.max(0, 1 - goalShare.reduce((a, b) => a + b, 0));
  const first = new Float64Array(n);
  const second = new Float64Array(n);
  for (let round = 0; round < 12; round++) {
    let total = other;
    for (let k = 0; k < n; k++) total += w[k];
    if (!(total > 0)) return;
    first.fill(0);
    second.fill(0);
    // Scorer j (n stands for a teammate not listed, who takes no assist weight).
    for (let j = 0; j <= n; j++) {
      const pj = j < n ? goalShare[j] : otherGoal;
      if (!(pj > 0)) continue;
      const left = total - (j < n ? w[j] : 0);
      if (!(left > 0)) continue;
      for (let m = 0; m < n; m++) {
        if (m === j) continue;
        const pm = w[m] / left;
        first[m] += pj * pm;
        const rest = left - w[m];
        if (!(rest > 0)) continue;
        for (let i = 0; i < n; i++) if (i !== j && i !== m) second[i] += pj * pm * (w[i] / rest);
      }
      // First assist to an unlisted teammate: the second is drawn from everyone but the scorer.
      const po = other / left;
      for (let i = 0; i < n; i++) if (i !== j) second[i] += pj * po * (w[i] / left);
    }
    let worst = 0;
    for (let k = 0; k < n; k++) {
      const got = (p1 + p2) * first[k] + p2 * second[k];
      if (!(got > 0) || !(target[k] > 0)) continue;
      const f = target[k] / got;
      worst = Math.max(worst, Math.abs(f - 1));
      w[k] *= f;
    }
    if (worst < 1e-4) return;
  }
}

const scratch = new WeakMap<NhlGameIn, Score>();

/**
 * Inverse-CDF tables for the engine's gamma draws (pace, team and skater form, blocks), mean exactly 1.
 * A full roster draws about a hundred of these a game, and a lookup is several times cheaper than Marsaglia-Tsang.
 */
function gammaTable(shape: number, size = 4096): Float64Array {
  const rng = makeRng(97);
  const draws = new Float64Array(size * 32);
  for (let i = 0; i < draws.length; i++) draws[i] = rng.gamma(shape, 1 / shape);
  draws.sort();
  const out = new Float64Array(size);
  let mean = 0;
  for (let i = 0; i < size; i++) {
    out[i] = draws[Math.floor((i + 0.5) * 32)];
    mean += out[i] / size;
  }
  for (let i = 0; i < size; i++) out[i] /= mean;
  return out;
}

type Tables = { pace: Float64Array; team: Float64Array; shot: Float64Array; form: Float64Array; block: Float64Array };
let tables: Tables | null = null;
function tablesOf(): Tables {
  const s = NHL_SIM;
  return (tables ??= {
    pace: gammaTable(s.paceShape),
    team: gammaTable(s.teamShape),
    shot: gammaTable(s.shotShape),
    form: gammaTable(s.formShape),
    block: gammaTable(s.blockShape),
  });
}
const draw = (t: Float64Array, rng: Rng) => t[(rng.next() * t.length) | 0];
/** 1 / E[sqrt(form)], so assists drawn on the square root of form keep their mean against unlisted teammates. */
const ROOT_NORM = 1 / (1 - 1 / (8 * NHL_SIM.formShape));

/**
 * Picks a skater (position in `side.idx`) with weight w[k]·f[idx[k]], or -1 for a teammate not listed.
 * Skaters `skipA` and `skipB` (the scorer and the first assist) are redrawn: nobody assists his own goal.
 */
function pick(side: Side, w: Float64Array, f: Float64Array, other: number, total: number, rng: Rng, skipA = -1, skipB = -1): number {
  for (let tries = 0; tries < 8; tries++) {
    let u = rng.next() * total;
    if (u < other) return -1;
    u -= other;
    let k = 0;
    for (; k < w.length - 1; k++) {
      u -= w[k] * f[side.idx[k]];
      if (u < 0) break;
    }
    if (k !== skipA && k !== skipB) return k;
  }
  return -1;
}

/**
 * Plays one game into `out`. `want`, when given, marks the players whose shots and blocks are drawn
 * (a ticket only reads its own legs); everyone else's are left at their goals and 0. Goals, assists and
 * saves are always drawn for the whole roster, because a team's goals are split across all of it.
 */
export function playNhl(game: NhlGameIn, rng: Rng, out: NhlGameState, want?: Uint8Array): void {
  const s = NHL_SIM;
  const plan = planOf(game);
  let sc = scratch.get(game);
  if (!sc) {
    sc = newScore();
    scratch.set(game, sc);
  }
  playScore(plan.bH, plan.bA, rng, sc);
  out.homePts = sc.h;
  out.awayPts = sc.a;
  out.homeEn = sc.enH;
  out.awayEn = sc.enA;
  out.homeSo = sc.soH;
  out.awaySo = sc.soA;
  out.ending = sc.ending;

  const st = out.stat;
  st.goals.fill(0);
  st.assists.fill(0);
  st.sog.fill(0);
  st.saves.fill(0);
  st.blocks.fill(0);
  const form = plan.form;
  const root = plan.root;
  const tab = tablesOf();
  for (let i = 0; i < form.length; i++) {
    form[i] = draw(tab.form, rng);
    root[i] = Math.sqrt(form[i]) * ROOT_NORM;
  }

  // Non-goal shots for each team: the opposing starter's saves.
  const share = (plan.bH * sc.formH) / (plan.bH * sc.formH + plan.bA * sc.formA);
  const paceShots = Math.pow(sc.pace, s.shotPacePow);
  const savesOf = (side: Side, teamForm: number, trail: number, lead: number, adj: number, ot: number, otShare: number) => {
    const reg = side.saves - s.otShots * ot;
    const mean = Math.max(1, reg) / adj * paceShots * Math.pow(teamForm, s.shotTeamPow) * shotAdj(trail, lead) * draw(tablesOf().shot, rng);
    return poissonLarge(mean, rng) + rng.poisson(s.otShots * sc!.otTime * 2 * otShare);
  };
  const nH = savesOf(plan.home, sc.formH, sc.trailH, sc.trailA, plan.cal.adjH, plan.cal.otH, share);
  const nA = savesOf(plan.away, sc.formA, sc.trailA, sc.trailH, plan.cal.adjA, plan.cal.otA, 1 - share);
  out.homeShots = sc.h - sc.soH + nH;
  out.awayShots = sc.a - sc.soA + nA;
  if (plan.away.starter >= 0) st.saves[plan.away.starter] = nH;
  if (plan.home.starter >= 0) st.saves[plan.home.starter] = nA;

  // Goals and assists, one goal at a time.
  const weigh = (side: Side, w: Float64Array, f: Float64Array, other: number) => {
    let sum = other;
    for (let k = 0; k < side.idx.length; k++) sum += w[k] * f[side.idx[k]];
    return sum;
  };
  const goalTot = [weigh(plan.home, plan.home.goalW, form, plan.home.otherGoal), weigh(plan.away, plan.away.goalW, form, plan.away.otherGoal)];
  const astTot = [weigh(plan.home, plan.home.assistW, root, plan.home.otherAssist), weigh(plan.away, plan.away.assistW, root, plan.away.otherAssist)];
  for (let e = 0; e < sc.n; e++) {
    const t = sc.who[e];
    const side = t === 0 ? plan.home : plan.away;
    if (side.idx.length === 0 || !(goalTot[t] > 0)) continue;
    const scorer = pick(side, side.goalW, form, side.otherGoal, goalTot[t], rng);
    if (scorer >= 0) st.goals[side.idx[scorer]] += 1;
    if (!(astTot[t] > 0)) continue;
    const u = rng.next();
    const nAst = u < s.assist0 ? 0 : u < s.assist0 + s.assist1 ? 1 : 2;
    let first = -1;
    for (let j = 0; j < nAst; j++) {
      const k = pick(side, side.assistW, root, side.otherAssist, astTot[t], rng, scorer, first);
      if (k >= 0) st.assists[side.idx[k]] += 1;
      first = k;
    }
  }

  // Shots on goal: goals plus a draw around the skater's own rate, scaled by his team's shooting night.
  const fill = (side: Side, n: number, oppN: number, oppSide: Side) => {
    const teamF = n / Math.max(1, side.saves);
    const oppF = oppN / Math.max(1, oppSide.saves);
    for (let k = 0; k < side.idx.length; k++) {
      const i = side.idx[k];
      st.sog[i] = st.goals[i];
      if (want && !want[i]) continue;
      st.sog[i] += rng.poisson(side.shotMean[k] * teamF * form[i]);
      if (side.blockMean[k] > 0) st.blocks[i] = rng.poisson(side.blockMean[k] * oppF * draw(tab.block, rng));
    }
  };
  fill(plan.home, nH, nA, plan.away);
  fill(plan.away, nA, nH, plan.home);
  for (let i = 0; i < st.points.length; i++) st.points[i] = st.goals[i] + st.assists[i];
}

const LOG_FACT = (() => {
  const t = new Float64Array(64);
  for (let k = 1; k < t.length; k++) t[k] = t[k - 1] + Math.log(k);
  return t;
})();

function logFactorial(k: number): number {
  if (k < LOG_FACT.length) return LOG_FACT[k];
  return k * Math.log(k) - k + 0.5 * Math.log(2 * Math.PI * k) + 1 / (12 * k) - 1 / (360 * k * k * k);
}

/**
 * Exact Poisson draw in a handful of uniforms for the team shot counts (mean ~26), where the product
 * method in rng.ts would spend one uniform per shot. Hörmann's transformed rejection (PTRS).
 */
function poissonLarge(lambda: number, rng: Rng): number {
  if (lambda < 10) return rng.poisson(lambda);
  const slam = Math.sqrt(lambda);
  const loglam = Math.log(lambda);
  const b = 0.931 + 2.53 * slam;
  const a = -0.059 + 0.02483 * b;
  const invalpha = 1.1239 + 1.1328 / (b - 3.4);
  const vr = 0.9277 - 3.6224 / (b - 2);
  for (;;) {
    const u = rng.next() - 0.5;
    const v = rng.next();
    const us = 0.5 - Math.abs(u);
    const k = Math.floor(((2 * a) / us + b) * u + lambda + 0.43);
    if (us >= 0.07 && v <= vr) return k;
    if (k < 0 || (us < 0.013 && v > us)) continue;
    if (Math.log(v) + Math.log(invalpha) - Math.log(a / (us * us) + b) <= -lambda + k * loglam - logFactorial(k)) return k;
  }
}
