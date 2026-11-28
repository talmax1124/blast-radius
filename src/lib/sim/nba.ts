import { makeRng, type Rng } from "./rng.ts";

/**
 * One NBA game, played forward from its market lines and each player's projection.
 *
 * The draws are layered so the legs on a ticket move together the way they do on a real night:
 * - the game draws a margin and a total; the team's share of the total scales its scorers and passers,
 *   and the opponent's misses feed rebounds;
 * - a lopsided margin sits the starters late, so overs on a favorite's stars fail together in a blowout;
 * - each player draws minutes (with a small foul-trouble or early-exit tail) and one form factor
 *   shared by all of his counting stats, so a hot night lifts points and threes at once.
 */

export type NbaPlayerIn = {
  name: string;
  team: string;
  minutes: number;
  pts: number;
  reb: number;
  ast: number;
  threes: number;
};

export type NbaGameIn = {
  home: string;
  away: string;
  /** Home spread as posted: -4.5 means the home team lays 4.5. */
  spread: number;
  total: number;
  players: NbaPlayerIn[];
};

export type NbaStat = "pts" | "reb" | "ast" | "threes" | "min";

/** One simulated game. Arrays are indexed like `players` and reused across draws. */
export type NbaGameState = {
  homePts: number;
  awayPts: number;
  stat: Record<NbaStat, Float64Array>;
};

export const NBA_SIM = {
  marginSd: 12,
  totalSd: 16,
  minutesSd: 3.5,
  /** Share of nights a player's minutes are cut short (fouls, a tweak, an early hook). */
  shortNight: 0.04,
  /** Starters begin to sit once the margin passes this, losing 2.5% of minutes per point beyond it. */
  blowoutAt: 12,
  blowoutSlope: 0.025,
  blowoutCap: 0.3,
  starterMinutes: 24,
  /** Gamma shape of the nightly form factor. Its spread is 1/sqrt(shape): about 18%. */
  formShape: 30,
  dispersion: { pts: 25, reb: 10, ast: 8, threes: 6 },
} as const;

export function newNbaState(game: NbaGameIn): NbaGameState {
  const n = game.players.length;
  return {
    homePts: 0,
    awayPts: 0,
    stat: {
      pts: new Float64Array(n),
      reb: new Float64Array(n),
      ast: new Float64Array(n),
      threes: new Float64Array(n),
      min: new Float64Array(n),
    },
  };
}

const keeps = new WeakMap<NbaGameIn, Float64Array>();

/**
 * A projection is a full night's average, and averages already include blowouts and short nights.
 * The sim draws those tails explicitly, so each player's minutes are scaled back up to keep the mean.
 */
function keepOf(game: NbaGameIn): Float64Array {
  const cached = keeps.get(game);
  if (cached) return cached;
  const s = NBA_SIM;
  const rng = makeRng(1);
  const draws = 20_000;
  const kept = new Float64Array(game.players.length);
  for (let k = 0; k < draws; k++) {
    const lead = Math.abs(-game.spread + s.marginSd * rng.normal());
    const cut = lead > s.blowoutAt ? 1 - Math.min(s.blowoutCap, (lead - s.blowoutAt) * s.blowoutSlope) : 1;
    const short = rng.next() < s.shortNight ? 0.3 + 0.5 * rng.next() : 1;
    for (let i = 0; i < game.players.length; i++) kept[i] += (game.players[i].minutes >= s.starterMinutes ? cut : 1) * short;
  }
  for (let i = 0; i < kept.length; i++) kept[i] = draws / Math.max(1e-9, kept[i]);
  keeps.set(game, kept);
  return kept;
}

export function playNba(game: NbaGameIn, rng: Rng, out: NbaGameState): void {
  const s = NBA_SIM;
  const homeEdge = -game.spread;
  const margin = homeEdge + s.marginSd * rng.normal();
  const total = Math.max(120, game.total + s.totalSd * rng.normal());
  out.homePts = Math.round((total + margin) / 2);
  out.awayPts = Math.round((total - margin) / 2);
  const expected = { home: (game.total + homeEdge) / 2, away: (game.total - homeEdge) / 2 };
  const pace = total / game.total;
  const keep = keepOf(game);

  for (let i = 0; i < game.players.length; i++) {
    const p = game.players[i];
    const home = p.team === game.home;
    const teamPts = home ? out.homePts : out.awayPts;
    const oppPts = home ? out.awayPts : out.homePts;
    const teamFactor = teamPts / (home ? expected.home : expected.away);
    const oppFactor = oppPts / (home ? expected.away : expected.home);

    let minutes = Math.min(44, Math.max(0, p.minutes + s.minutesSd * rng.normal()));
    if (rng.next() < s.shortNight) minutes *= 0.3 + 0.5 * rng.next();
    const lead = Math.abs(margin);
    if (p.minutes >= s.starterMinutes && lead > s.blowoutAt) {
      minutes *= 1 - Math.min(s.blowoutCap, (lead - s.blowoutAt) * s.blowoutSlope);
    }
    const share = p.minutes > 0 ? (minutes / p.minutes) * keep[i] : 0;
    const form = rng.gamma(s.formShape, 1 / s.formShape);

    const threes = rng.negBinomial(p.threes * share * form * Math.sqrt(teamFactor), s.dispersion.threes);
    const pts = Math.max(3 * threes, rng.negBinomial(p.pts * share * form * teamFactor, s.dispersion.pts));
    // Rebounds come from misses: a slow, cold game leaves more on the glass than its pace alone suggests.
    const reb = rng.negBinomial(p.reb * share * Math.sqrt(pace) * Math.pow(1 / Math.max(0.5, oppFactor), 0.3), s.dispersion.reb);
    const ast = rng.negBinomial(p.ast * share * Math.sqrt(form) * Math.pow(teamFactor, 0.7), s.dispersion.ast);

    out.stat.min[i] = minutes;
    out.stat.pts[i] = pts;
    out.stat.threes[i] = threes;
    out.stat.reb[i] = reb;
    out.stat.ast[i] = ast;
  }
}
