import type { NbaPlayer } from "../nba/types.ts";
import type { ScoredPlayer } from "../nfl/score.ts";
import type { NbaGameIn, NbaPlayerIn } from "./nba.ts";
import type { NflGameIn, NflPlayerIn } from "./nfl.ts";

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
