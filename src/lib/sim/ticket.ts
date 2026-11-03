import { blendMarket, noVigOver } from "../board/grade.ts";
import { makeRng } from "./rng.ts";
import { newNbaState, playNba, type NbaGameIn, type NbaGameState, type NbaStat } from "./nba.ts";
import { newNflState, playNfl, type NflGameIn, type NflGameState, type NflStat } from "./nfl.ts";

/**
 * Price a ticket by playing its games forward. Every leg is read off the same simulated game,
 * so the parlay's chance is the share of games where all of them hit, with the correlation built in
 * rather than assumed away by multiplying the legs.
 */

export type SimGame = { sport: "nba"; game: NbaGameIn } | { sport: "nfl"; game: NflGameIn };

export type NbaCombo = NbaStat | "pra" | "pr" | "pa" | "ra";
export type NflCombo = NflStat | "td" | "rushRecYd";

export type Leg =
  | { kind: "player"; game: number; player: string; stat: NbaCombo | NflCombo; side: "over" | "under"; line: number; price?: number; opposite?: number }
  | { kind: "moneyline"; game: number; team: string; price?: number; opposite?: number }
  | { kind: "spread"; game: number; team: string; line: number; price?: number; opposite?: number }
  | { kind: "total"; game: number; side: "over" | "under"; line: number; price?: number; opposite?: number }
  | { kind: "teamTotal"; game: number; team: string; side: "over" | "under"; line: number; price?: number; opposite?: number };

export type LegReport = {
  label: string;
  /** Share of simulated games where the leg hit. */
  sim: number;
  /** The leg after starting from the no-vig market price, when a two-way price was given. */
  blended: number | null;
  /** Mean of the stat across simulations, for player and total legs. */
  mean: number | null;
  /** Hit rate of the leg given that every other leg hit. Below `sim`, the legs fight each other. */
  givenRest: number;
};

export type TicketReport = {
  sims: number;
  legs: LegReport[];
  /** Share of simulated games where every leg hit. */
  joint: number;
  /** Product of the legs' own chances: what the ticket would be if the legs were unrelated. */
  independent: number;
  /** joint / independent. Above 1 the legs help each other; a book prices that in on a same-game parlay. */
  lift: number;
  /** Joint chance with each leg blended toward its market price, then scaled by the simulated lift. */
  calibrated: number;
  fairAmerican: number;
  /** Return per dollar at the offered parlay price, using the calibrated chance. 1 is break-even. */
  evAtOffer: number | null;
  /** Standard error of the joint estimate. */
  jointSe: number;
};

type State = { sport: "nba"; s: NbaGameState; g: NbaGameIn } | { sport: "nfl"; s: NflGameState; g: NflGameIn };

function playerIndex(g: { players: { name: string }[] }, name: string): number {
  const i = g.players.findIndex((p) => p.name.toLowerCase() === name.toLowerCase());
  if (i < 0) throw new Error(`No player named ${name} in the simulated game`);
  return i;
}

function teamPts(st: State, team: string): [number, number] {
  const home = st.g.home === team;
  if (!home && st.g.away !== team) throw new Error(`Team ${team} is not in the simulated game`);
  return home ? [st.s.homePts, st.s.awayPts] : [st.s.awayPts, st.s.homePts];
}

function value(st: State, leg: Leg, idx: number): number {
  switch (leg.kind) {
    case "total":
      return st.s.homePts + st.s.awayPts;
    case "teamTotal":
      return teamPts(st, leg.team)[0];
    case "moneyline":
    case "spread": {
      const [us, them] = teamPts(st, leg.team);
      return us - them;
    }
    case "player": {
      if (st.sport === "nba") {
        const t = st.s.stat;
        switch (leg.stat as NbaCombo) {
          case "pra":
            return t.pts[idx] + t.reb[idx] + t.ast[idx];
          case "pr":
            return t.pts[idx] + t.reb[idx];
          case "pa":
            return t.pts[idx] + t.ast[idx];
          case "ra":
            return t.reb[idx] + t.ast[idx];
          default:
            return t[leg.stat as NbaStat][idx];
        }
      }
      const t = st.s.stat;
      if (leg.stat === "td") return t.rushTd[idx] + t.recTd[idx];
      if (leg.stat === "rushRecYd") return t.rushYd[idx] + t.recYd[idx];
      return t[leg.stat as NflStat][idx];
    }
  }
}

function hit(leg: Leg, v: number): boolean {
  switch (leg.kind) {
    case "moneyline":
      return v > 0;
    case "spread":
      return v + leg.line > 0;
    case "total":
    case "teamTotal":
    case "player":
      return leg.side === "over" ? v > leg.line : v < leg.line;
  }
}

export function labelOf(leg: Leg, games: SimGame[]): string {
  const g = games[leg.game].game;
  switch (leg.kind) {
    case "moneyline":
      return `${leg.team} moneyline`;
    case "spread":
      return `${leg.team} ${leg.line > 0 ? "+" : ""}${leg.line}`;
    case "total":
      return `${g.away} @ ${g.home} ${leg.side} ${leg.line}`;
    case "teamTotal":
      return `${leg.team} team total ${leg.side} ${leg.line}`;
    case "player":
      return `${leg.player} ${leg.side} ${leg.line} ${leg.stat}`;
  }
}

function americanToDecimal(a: number): number {
  return a < 0 ? 1 + 100 / -a : 1 + a / 100;
}

function toAmerican(p: number): number {
  if (!(p > 0) || p >= 1) return 0;
  return p >= 0.5 ? Math.round((-100 * p) / (1 - p)) : Math.round((100 * (1 - p)) / p);
}

export function simulateTicket(input: SimGame[], legs: Leg[], opts: { sims?: number; seed?: number; offered?: number; onProgress?: (done: number) => void } = {}): TicketReport {
  const sims = opts.sims ?? 1_000_000;
  const rng = makeRng(opts.seed ?? 7);
  let games = input;
  // NBA players only meet through the game's margin and total, so a game plays just the players on the ticket.
  // NFL players share their team's targets and carries, so the whole roster plays.
  games = games.map((sg, gi) => {
    if (sg.sport !== "nba") return sg;
    const names = new Set(legs.filter((l) => l.game === gi && l.kind === "player").map((l) => (l as { player: string }).player.toLowerCase()));
    return { sport: "nba", game: { ...sg.game, players: sg.game.players.filter((p) => names.has(p.name.toLowerCase())) } };
  });
  const states: State[] = games.map((sg) =>
    sg.sport === "nba" ? { sport: "nba", s: newNbaState(sg.game), g: sg.game } : { sport: "nfl", s: newNflState(sg.game), g: sg.game },
  );
  const idx = legs.map((l) => (l.kind === "player" ? playerIndex(states[l.game].g, l.player) : -1));
  const n = legs.length;
  const hits = new Float64Array(n);
  const sums = new Float64Array(n);
  const restHits = new Float64Array(n);
  const restCount = new Float64Array(n);
  const got = new Uint8Array(n);
  let joint = 0;

  for (let k = 0; k < sims; k++) {
    if (opts.onProgress && k % 50_000 === 0) opts.onProgress(k);
    for (const st of states) {
      if (st.sport === "nba") playNba(st.g, rng, st.s);
      else playNfl(st.g, rng, st.s);
    }
    let all = 0;
    for (let j = 0; j < n; j++) {
      const v = value(states[legs[j].game], legs[j], idx[j]);
      sums[j] += v;
      got[j] = hit(legs[j], v) ? 1 : 0;
      hits[j] += got[j];
      all += got[j];
    }
    if (all === n) joint += 1;
    // For each leg, how it does when every other leg already hit.
    for (let j = 0; j < n; j++) {
      if (all - got[j] === n - 1) {
        restCount[j] += 1;
        restHits[j] += got[j];
      }
    }
  }

  const reports: LegReport[] = legs.map((leg, j) => {
    const sim = hits[j] / sims;
    const market = leg.price != null ? noVigOver(leg.price, leg.opposite ?? null) : null;
    return {
      label: labelOf(leg, games),
      sim,
      blended: market != null && leg.opposite != null ? blendMarket(clamp(sim), market) : null,
      mean: leg.kind === "moneyline" || leg.kind === "spread" ? null : sums[j] / sims,
      givenRest: restCount[j] > 0 ? restHits[j] / restCount[j] : 0,
    };
  });
  const pJoint = joint / sims;
  const independent = reports.reduce((p, r) => p * r.sim, 1);
  const lift = independent > 0 ? pJoint / independent : 0;
  const calibrated = Math.min(1, reports.reduce((p, r) => p * (r.blended ?? r.sim), 1) * lift);
  return {
    sims,
    legs: reports,
    joint: pJoint,
    independent,
    lift,
    calibrated,
    fairAmerican: toAmerican(calibrated),
    evAtOffer: opts.offered != null ? calibrated * americanToDecimal(opts.offered) : null,
    jointSe: Math.sqrt((pJoint * (1 - pJoint)) / sims),
  };
}

function clamp(p: number): number {
  return Math.min(0.999, Math.max(0.001, p));
}
