import type { NbaPlayer } from "../nba/types.ts";
import type { ScoredPlayer } from "../nfl/score.ts";
import type { NbaGameIn, NbaPlayerIn } from "./nba.ts";
import type { NflGameIn, NflPlayerIn } from "./nfl.ts";
import type { NhlGame, NhlSkater } from "../nhl/types.ts";
import { noVigOver } from "../board/grade.ts";
import type { NhlGameIn, NhlPlayerIn } from "./nhl.ts";
import { normName } from "./roster.ts";

/** Turn the engines' projections into simulator inputs. Lines come from the book, usage from the models. */

export function nbaPlayers(players: NbaPlayer[], teams: string[]): NbaPlayerIn[] {
  return players
    .filter((p) => teams.includes(p.team) && p.minutes > 0)
    .map((p) => ({
      name: p.name,
      team: p.team,
      minutes: p.minutes,
      pts: p.quotes.pts.projection,
      reb: p.quotes.reb.projection,
      ast: p.quotes.ast.projection,
      threes: p.quotes.threes.projection,
    }));
}

export function nbaGame(players: NbaPlayer[], line: { home: string; away: string; spread: number; total: number }): NbaGameIn {
  return { ...line, players: nbaPlayers(players, [line.home, line.away]) };
}

export function nflPlayers(players: Pick<ScoredPlayer, "name" | "team" | "pos" | "expPassAtt" | "expPassYd" | "expPassTd" | "expRushAtt" | "expRushYd" | "expRushTd" | "expTargets" | "expRec" | "expRecYd" | "expRecTd">[], teams: string[]): NflPlayerIn[] {
  const seen = new Set<string>();
  const out: NflPlayerIn[] = [];
  for (const p of players) {
    if (!teams.includes(p.team) || seen.has(p.name)) continue;
    seen.add(p.name);
    out.push({
      name: p.name,
      team: p.team,
      pos: p.pos,
      passAtt: p.expPassAtt,
      passYd: p.expPassYd,
      passTd: p.expPassTd,
      rushAtt: p.expRushAtt,
      rushYd: p.expRushYd,
      rushTd: p.expRushTd,
      targets: p.expTargets,
      rec: p.expRec,
      recYd: p.expRecYd,
      recTd: p.expRecTd,
    });
  }
  return out;
}

export function nflGame(players: Parameters<typeof nflPlayers>[0], line: { home: string; away: string; spread: number; total: number }): NflGameIn {
  return { ...line, players: nflPlayers(players, [line.home, line.away]) };
}

/** The board fields the NHL adapter reads: shots and points rates, shooting percentage, games played. */
export type NhlBoardSkater = Pick<NhlSkater, "name" | "team" | "pos" | "lambdaSog" | "lambdaPts" | "shPct"> & { gp?: number };
export type NhlLine = { home: string; away: string; spread: number; total: number; goalies?: { name: string; team: string }[] };

/**
 * ICE board skaters to sim inputs. Expected goals are shots × shooting percentage and assists are the rest
 * of the projected points; F covers C/LW/RW. Goalies come from the board game's `goalies` list (roster order),
 * and the first one per team is the starter unless `starters` names him. ESPN rosters list scratches and
 * injured players too, and every listed skater takes a share of his team's goals, so pass `lineup` (names
 * dressing tonight) when it is known; without it, listed rates beyond the team's expected goals are scaled down.
 */
export function nhlPlayers(skaters: NhlBoardSkater[], teams: string[], goalies: { name: string; team: string }[] = [], opts: { lineup?: string[]; starters?: Record<string, string> } = {}): NhlPlayerIn[] {
  const dressed = opts.lineup ? new Set(opts.lineup.map(normName)) : null;
  const seen = new Set<string>();
  const out: NhlPlayerIn[] = [];
  for (const p of skaters) {
    if (!teams.includes(p.team) || seen.has(p.name)) continue;
    if (dressed && !dressed.has(normName(p.name))) continue;
    seen.add(p.name);
    const sog = Math.max(0, p.lambdaSog);
    const goals = sog * Math.max(0, p.shPct);
    out.push({ name: p.name, team: p.team, pos: p.pos === "D" ? "D" : "F", sog, goals, assists: Math.max(0, p.lambdaPts - goals), points: p.lambdaPts });
  }
  for (const team of teams) {
    const mine = goalies.filter((g) => g.team === team && !seen.has(g.name));
    const named = opts.starters?.[team];
    const at = named ? mine.findIndex((g) => normName(g.name) === normName(named)) : -1;
    if (at > 0) mine.unshift(...mine.splice(at, 1));
    for (const g of mine) {
      seen.add(g.name);
      out.push({ name: g.name, team, pos: "G", sog: 0, goals: 0, assists: 0 });
    }
  }
  return out;
}

export function nhlGame(skaters: NhlBoardSkater[], line: NhlLine, opts: { lineup?: string[]; starters?: Record<string, string> } = {}): NhlGameIn {
  const { goalies, ...rest } = line;
  return { ...rest, players: nhlPlayers(skaters, [line.home, line.away], goalies ?? [], opts) };
}

/** Spread of the NHL engine's regulation-plus-overtime margin, for turning a moneyline into an expected margin. */
export const NHL_MARGIN_SD = 2.45;

/**
 * An ICE board game's moneylines and total as an NhlLine. The board has no puck-line spread, so the expected
 * margin is read off the no-vig home win chance (margin ≈ 2.45·Φ⁻¹(p), scaled with the total), which the
 * engine prices back to within about two points. A missing total falls back to `fallbackTotal`.
 */
export function nhlLine(game: Pick<NhlGame, "home" | "away" | "total" | "homeMl" | "awayMl" | "goalies">, fallbackTotal = 6.1): NhlLine {
  const total = game.total != null && game.total > 0 ? game.total : fallbackTotal;
  const ml = (s: string | null) => {
    if (s == null) return null;
    if (/^even$/i.test(s.trim())) return 100;
    const n = Number(s.replace(/[^0-9+.-]/g, ""));
    return Number.isFinite(n) && Math.abs(n) >= 100 ? n : null;
  };
  const h = ml(game.homeMl);
  const a = ml(game.awayMl);
  const p = h != null ? noVigOver(h, a) : a != null ? 1 - noVigOver(a, null) : 0.5;
  const margin = NHL_MARGIN_SD * Math.sqrt(total / 6.1) * inverseNormal(Math.min(0.95, Math.max(0.05, p)));
  return { home: game.home, away: game.away, spread: -margin, total, goalies: game.goalies };
}

function inverseNormal(p: number): number {
  // Bisection on the normal CDF (Abramowitz-Stegun 7.1.26 for erf); plenty for a margin.
  const cdf = (x: number) => {
    const z = Math.abs(x) / Math.SQRT2;
    const t = 1 / (1 + 0.3275911 * z);
    const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
    return x >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
  };
  let lo = -5;
  let hi = 5;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (cdf(mid) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
