import type { Rng } from "./rng.ts";

/**
 * One NFL game, played forward from its market lines and each player's projected usage.
 *
 * Everything on a ticket is derived from the same simulated game, so the legs are tied the way they are on Sunday:
 * - the game draws a margin and a total; game script moves volume (a trailing team throws, a leading team runs);
 * - team targets and carries are split among players with a noisy share, then caught and gained one play at a time;
 * - a quarterback's passing yards are his receivers' yards, so a big receiver leg and a big passing leg rise together;
 * - touchdowns come out of the team's simulated score and go to the players who had the volume that night.
 */

export type NflPlayerIn = {
  name: string;
  team: string;
  pos: string;
  passAtt?: number;
  passYd?: number;
  passTd?: number;
  rushAtt?: number;
  rushYd?: number;
  rushTd?: number;
  targets?: number;
  rec?: number;
  recYd?: number;
  recTd?: number;
};

export type NflGameIn = {
  home: string;
  away: string;
  /** Home spread as posted: -3 means the home team lays 3. */
  spread: number;
  total: number;
  players: NflPlayerIn[];
};

export type NflStat = "passYd" | "passTd" | "rushAtt" | "rushYd" | "rushTd" | "targets" | "rec" | "recYd" | "recTd";

export type NflGameState = {
  homePts: number;
  awayPts: number;
  stat: Record<NflStat, Float64Array>;
};

export const NFL_SIM = {
  marginSd: 13.5,
  totalSd: 10,
  /** Share of a pass attempt that becomes a target for someone. */
  targetRate: 0.93,
  /** Gamma shape of each player's nightly share. Higher is steadier usage. */
  shareShape: 14,
  /** Points per touchdown once field goals are mixed in. */
  pointsPerTd: 7.4,
  /** Yards-per-catch spread for one reception. Catches are lumpy: most are short, a few are long. */
  catchCv: 0.95,
  carrySd: 5.5,
  breakaway: 0.025,
} as const;

export function newNflState(game: NflGameIn): NflGameState {
  const n = game.players.length;
  const arr = () => new Float64Array(n);
  return {
    homePts: 0,
    awayPts: 0,
    stat: { passYd: arr(), passTd: arr(), rushAtt: arr(), rushYd: arr(), rushTd: arr(), targets: arr(), rec: arr(), recYd: arr(), recTd: arr() },
  };
}

type TeamPlan = {
  idx: number[];
  passAtt: number;
  rushAtt: number;
  targetSum: number;
  carrySum: number;
  passYdPerRecYd: number;
  passTdShare: number;
  recTdSum: number;
  rushTdSum: number;
  expPts: number;
};

const plans = new WeakMap<NflGameIn, { home: TeamPlan; away: TeamPlan }>();

function planOf(game: NflGameIn): { home: TeamPlan; away: TeamPlan } {
  const cached = plans.get(game);
  if (cached) return cached;
  const homeEdge = -game.spread;
  const build = (team: string, expPts: number): TeamPlan => {
    const idx = game.players.map((p, i) => (p.team === team ? i : -1)).filter((i) => i >= 0);
    const ps = idx.map((i) => game.players[i]);
    const sum = (f: (p: NflPlayerIn) => number | undefined) => ps.reduce((a, p) => a + (f(p) ?? 0), 0);
    const targetSum = sum((p) => p.targets);
    const qbAtt = sum((p) => p.passAtt);
    const passAtt = qbAtt > 0 ? qbAtt : targetSum / NFL_SIM.targetRate;
    const recYd = sum((p) => p.recYd);
    const passYd = sum((p) => p.passYd);
    const recTdSum = sum((p) => p.recTd);
    const rushTdSum = sum((p) => p.rushTd);
    const passTd = sum((p) => p.passTd);
    const passTdTeam = Math.max(passTd, recTdSum);
    return {
      idx,
      passAtt,
      rushAtt: Math.max(sum((p) => p.rushAtt), 1),
      targetSum: Math.max(targetSum, 1),
      carrySum: Math.max(sum((p) => p.rushAtt), 1),
      // Listed receivers rarely carry every yard: the rest went to players not on the sheet.
      passYdPerRecYd: recYd > 0 && passYd > 0 ? Math.max(1, passYd / recYd) : 1,
      passTdShare: passTdTeam + rushTdSum > 0 ? passTdTeam / (passTdTeam + rushTdSum) : 0.6,
      recTdSum: Math.max(recTdSum, passTd),
      rushTdSum,
      expPts,
    };
  };
  const plan = { home: build(game.home, (game.total + homeEdge) / 2), away: build(game.away, (game.total - homeEdge) / 2) };
  plans.set(game, plan);
  return plan;
}

export function playNfl(game: NflGameIn, rng: Rng, out: NflGameState): void {
  const s = NFL_SIM;
  const plan = planOf(game);
  const homeEdge = -game.spread;
  const margin = homeEdge + s.marginSd * rng.normal();
  const total = Math.max(6, game.total + s.totalSd * rng.normal());
  out.homePts = Math.max(0, Math.round((total + margin) / 2));
  out.awayPts = Math.max(0, Math.round((total - margin) / 2));
  for (const arr of Object.values(out.stat)) arr.fill(0);
  playTeam(game, plan.home, out.homePts, out.homePts - out.awayPts, rng, out);
  playTeam(game, plan.away, out.awayPts, out.awayPts - out.homePts, rng, out);
}

function playTeam(game: NflGameIn, t: TeamPlan, pts: number, lead: number, rng: Rng, out: NflGameState): void {
  const s = NFL_SIM;
  if (!t.idx.length) return;
  const script = Math.max(-1.5, Math.min(1.5, lead / 14));
  const volume = Math.pow(Math.max(0.3, pts / Math.max(1, t.expPts)), 0.25) * (1 + 0.06 * rng.normal());
  const passAtt = Math.max(8, t.passAtt * volume * (1 - 0.12 * script));
  const rushAtt = Math.max(5, t.rushAtt * volume * (1 + 0.15 * script));
  // A team that scores more was also more efficient per play.
  const eff = Math.pow(Math.max(0.3, pts / Math.max(1, t.expPts)), 0.35);

  // Noisy shares: each player's slice of the night's targets and carries.
  let tw = 0;
  let cw = 0;
  const tShare = new Float64Array(t.idx.length);
  const cShare = new Float64Array(t.idx.length);
  for (let k = 0; k < t.idx.length; k++) {
    const p = game.players[t.idx[k]];
    tShare[k] = (p.targets ?? 0) > 0 ? ((p.targets ?? 0) / t.targetSum) * rng.gamma(s.shareShape, 1 / s.shareShape) : 0;
    cShare[k] = (p.rushAtt ?? 0) > 0 ? ((p.rushAtt ?? 0) / t.carrySum) * rng.gamma(s.shareShape, 1 / s.shareShape) : 0;
    tw += tShare[k];
    cw += cShare[k];
  }
  const listedTargets = t.targetSum / (t.passAtt * s.targetRate);
  let teamTargets = Math.round(passAtt * s.targetRate * Math.min(1, listedTargets));
  let teamCarries = Math.round(rushAtt);
  let tLeft = tw;
  let cLeft = cw;
  let recYdTeam = 0;
  let qb = -1;

  for (let k = 0; k < t.idx.length; k++) {
    const i = t.idx[k];
    const p = game.players[i];
    if ((p.passAtt ?? 0) > 0 && qb < 0) qb = i;
    // Sequential binomials split the night's totals without overshooting them.
    const targets = tLeft > 0 ? rng.binomial(teamTargets, Math.min(1, tShare[k] / tLeft)) : 0;
    teamTargets -= targets;
    tLeft -= tShare[k];
    const carries = cLeft > 0 ? rng.binomial(teamCarries, Math.min(1, cShare[k] / cLeft)) : 0;
    teamCarries -= carries;
    cLeft -= cShare[k];

    const catchRate = (p.targets ?? 0) > 0 ? Math.min(0.95, (p.rec ?? 0) / (p.targets ?? 1)) : 0;
    const rec = rng.binomial(targets, catchRate);
    const ypr = (p.rec ?? 0) > 0 ? ((p.recYd ?? 0) / (p.rec ?? 1)) * eff : 0;
    let recYd = 0;
    for (let c = 0; c < rec; c++) recYd += rng.lognormal(ypr, s.catchCv);

    // Breakaways are part of the projected average, so the base gain per carry leaves room for them.
    const ypc = (p.rushAtt ?? 0) > 0 ? Math.max(0.5, (p.rushYd ?? 0) / (p.rushAtt ?? 1) - s.breakaway * 37.5) * eff : 0;
    let rushYd = carries > 0 ? carries * ypc + s.carrySd * Math.sqrt(carries) * rng.normal() : 0;
    for (let c = 0; c < carries; c++) if (rng.next() < s.breakaway) rushYd += 15 + 45 * rng.next();

    out.stat.targets[i] = targets;
    out.stat.rec[i] = rec;
    out.stat.recYd[i] = Math.round(recYd);
    out.stat.rushAtt[i] = carries;
    out.stat.rushYd[i] = Math.round(Math.max(-5, rushYd));
    recYdTeam += recYd;
  }
  if (qb >= 0) out.stat.passYd[qb] = Math.round(recYdTeam * t.passYdPerRecYd);

  // Touchdowns come out of the score, then go to whoever had the volume tonight.
  const tdMean = pts / s.pointsPerTd;
  const tds = Math.floor(tdMean) + (rng.next() < tdMean - Math.floor(tdMean) ? 1 : 0);
  for (let d = 0; d < tds; d++) {
    const pass = rng.next() < t.passTdShare;
    const pool = pass ? t.recTdSum : t.rushTdSum;
    let pick = rng.next() * Math.max(pool, 1e-9) * 1.25; // a fifth of the room goes to players not on the sheet
    for (let k = 0; k < t.idx.length && pick > 0; k++) {
      const i = t.idx[k];
      const p = game.players[i];
      const base = pass ? (p.recTd ?? 0) : (p.rushTd ?? 0);
      if (!(base > 0)) continue;
      const used = pass ? out.stat.targets[i] / Math.max(0.5, p.targets ?? 0.5) : out.stat.rushAtt[i] / Math.max(0.5, p.rushAtt ?? 0.5);
      pick -= base * used;
      if (pick <= 0) {
        if (pass) out.stat.recTd[i] += 1;
        else out.stat.rushTd[i] += 1;
      }
    }
    if (pass && qb >= 0) out.stat.passTd[qb] += 1;
  }
}
