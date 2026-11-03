/**
 * Price a ticket from the command line:
 *
 *   node --experimental-strip-types src/lib/sim/cli.ts ticket.json
 *
 * ticket.json holds { games, legs, sims?, seed?, offered? }. A game is either a full SimGame
 * ({ sport, game: { home, away, spread, total, players } }) or a board reference
 * ({ sport, board: "path/to/board.json", home, away, spread, total }) that pulls the players
 * from a saved NBA or NFL engine board.
 *
 * Add --live to check each game against the real world first: ESPN depth charts and injury reports
 * (players ruled out are dropped, missing starters added) and the kickoff forecast at the stadium
 * (wind, rain, snow and cold move the total and the passing game). Every change is printed.
 */
import { readFileSync } from "node:fs";
import { nbaGame, nflGame } from "./adapters.ts";
import { simulateTicket, type Leg, type SimGame } from "./ticket.ts";
import { checkNbaRoster, checkNflRoster, needsReview, type RosterChange } from "./roster.ts";
import { espnInjuries, kickoff, nflDepth, nflWeather } from "./feeds.ts";
import { applyNflWeather, nflWeatherEffect } from "./weather.ts";

/** Check one game against today's depth charts, injury reports and weather. Feeds fail soft. */
async function live(g: SimGame, date: string): Promise<{ game: SimGame; changes: RosterChange[]; notes: string[] }> {
  const { home, away } = g.game;
  const notes: string[] = [];
  const soft = async <T>(what: string, f: () => Promise<T>, empty: T): Promise<T> => {
    try {
      return await f();
    } catch (e) {
      notes.push(`could not check ${what}: ${(e as Error).message}`);
      return empty;
    }
  };
  const injuries = await soft("injuries", () => espnInjuries(g.sport, [home, away]), []);
  if (g.sport === "nba") {
    const r = checkNbaRoster(g.game, injuries);
    return { game: { sport: "nba", game: r.game }, changes: r.changes, notes };
  }
  const season = Number(date.slice(0, 4)) - (Number(date.slice(4, 6)) < 3 ? 1 : 0);
  const depth = [...(await soft(`${home} depth chart`, () => nflDepth(home, season), [])), ...(await soft(`${away} depth chart`, () => nflDepth(away, season), []))];
  const r = checkNflRoster(g.game, depth, injuries);
  const ko = await soft("kickoff time", () => kickoff("nfl", date, home), null);
  const weather = ko ? await soft("weather", () => nflWeather(home, ko), null) : null;
  const effect = nflWeatherEffect(weather);
  if (!weather) notes.push("weather not checked");
  else notes.push(`weather at ${home}: ${weather.dome ? "roof closed" : `${Math.round(weather.tempF)}°F, wind ${Math.round(weather.windMph)} mph, ${weather.precipIn.toFixed(2)} in/hr`}${effect.notes.length ? ` → ${effect.notes.join(", ")}, total ${effect.totalPts.toFixed(1)}, passing ×${effect.pass.toFixed(2)}` : " → no adjustment"}`);
  return { game: { sport: "nfl", game: applyNflWeather(r.game, effect) }, changes: r.changes, notes };
}

type GameRef = SimGame | { sport: "nba" | "nfl"; board: string; home: string; away: string; spread: number; total: number };

function resolve(ref: GameRef): SimGame {
  if ("game" in ref) return ref;
  const raw = JSON.parse(readFileSync(ref.board, "utf8"));
  const line = { home: ref.home, away: ref.away, spread: ref.spread, total: ref.total };
  if (ref.sport === "nba") return { sport: "nba", game: nbaGame((raw.nba ?? raw).players, line) };
  const board = raw.nfl ?? raw;
  return { sport: "nfl", game: nflGame([...board.props, ...board.goalLine], line) };
}

const pct = (p: number) => `${(p * 100).toFixed(1)}%`;

async function main(path: string, checkLive: boolean): Promise<void> {
  const ticket = JSON.parse(readFileSync(path, "utf8")) as { games: GameRef[]; legs: Leg[]; sims?: number; seed?: number; offered?: number; date?: string };
  let games = ticket.games.map(resolve);
  if (checkLive) {
    const date = ticket.date ?? new Date().toISOString().slice(0, 10).replaceAll("-", "");
    const checked = [];
    for (const g of games) {
      const r = await live(g, date);
      console.log(`${g.game.away} at ${g.game.home}`);
      for (const n of r.notes) console.log(`  ${n}`);
      for (const c of r.changes) console.log(`  ${c.team} ${c.kind.padEnd(8)} ${c.name}: ${c.note}`);
      const review = needsReview(r.changes);
      if (review.length) console.log(`  REVIEW: ${review.map((c) => c.name).join(", ")} changed the roster; check legs on this game before betting`);
      checked.push(r.game);
    }
    games = checked;
    console.log("");
  }
  const started = Date.now();
  const r = simulateTicket(games, ticket.legs, { sims: ticket.sims, seed: ticket.seed, offered: ticket.offered });
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`${r.sims.toLocaleString()} simulated games in ${secs}s\n`);
  console.log("leg".padEnd(46), "sim".padStart(7), "blended".padStart(8), "mean".padStart(7), "if rest hit".padStart(12));
  for (const leg of r.legs) {
    console.log(
      leg.label.padEnd(46),
      pct(leg.sim).padStart(7),
      (leg.blended != null ? pct(leg.blended) : "—").padStart(8),
      (leg.mean != null ? leg.mean.toFixed(1) : "—").padStart(7),
      pct(leg.givenRest).padStart(12),
    );
  }
  console.log(`\nall legs hit: ${pct(r.joint)} (±${pct(1.96 * r.jointSe)})`);
  console.log(`if the legs were unrelated: ${pct(r.independent)}  ·  lift ${r.lift.toFixed(2)}x`);
  console.log(`calibrated: ${pct(r.calibrated)}  ·  fair price ${r.fairAmerican > 0 ? "+" : ""}${r.fairAmerican}`);
  if (r.evAtOffer != null) console.log(`return per $1 at +${ticket.offered}: ${r.evAtOffer.toFixed(2)}`);
}

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
if (!file) {
  console.error("usage: node --experimental-strip-types src/lib/sim/cli.ts ticket.json [--live]");
  process.exit(1);
}
await main(file, args.includes("--live"));
