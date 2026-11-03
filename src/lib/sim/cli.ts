/**
 * Price a ticket from the command line:
 *
 *   node --experimental-strip-types src/lib/sim/cli.ts ticket.json
 *
 * ticket.json holds { games, legs, sims?, seed?, offered? }. A game is either a full SimGame
 * ({ sport, game: { home, away, spread, total, players } }) or a board reference
 * ({ sport, board: "path/to/board.json", home, away, spread, total }) that pulls the players
 * from a saved NBA or NFL engine board.
 */
import { readFileSync } from "node:fs";
import { nbaGame, nflGame } from "./adapters.ts";
import { simulateTicket, type Leg, type SimGame } from "./ticket.ts";

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

function main(path: string): void {
  const ticket = JSON.parse(readFileSync(path, "utf8")) as { games: GameRef[]; legs: Leg[]; sims?: number; seed?: number; offered?: number };
  const games = ticket.games.map(resolve);
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

const file = process.argv[2];
if (!file) {
  console.error("usage: node --experimental-strip-types src/lib/sim/cli.ts ticket.json");
  process.exit(1);
}
main(file);
