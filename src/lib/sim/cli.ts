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
 *
 * Add --consensus to run the play-by-play engine too and flag every leg the two engines disagree on by
 * more than ten points. Flagged legs should come off the card: one of the inputs is wrong, and nobody
 * knows which engine has it right.
 */
import { readFileSync } from "node:fs";
import { nbaGame, nflGame } from "./adapters.ts";
import { simulateTicket, type Leg, type SimGame } from "./ticket.ts";
import { applyQbDowngrade, checkNbaRoster, checkNflRoster, needsReview, qbLevel, type RosterChange } from "./roster.ts";
import { espnInjuries, kickoff, nflDepth, nflPassShare, nflWeather } from "./feeds.ts";
import { applyNflWeather, nflWeatherEffect } from "./weather.ts";
import { consensus, CONSENSUS_GAP } from "./consensus.ts";

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
  // Who is under center: a backup or emergency starter cuts the team's passing game.
  for (const team of [home, away]) {
    const out = new Set(injuries.filter((i) => i.team === team && (i.status === "out" || i.status === "doubtful")).map((i) => i.name));
    const starter = depth.filter((d) => d.team === team && d.pos === "QB" && d.status !== "out" && d.status !== "doubtful" && !out.has(d.name)).sort((a, b) => a.rank - b.rank)[0];
    if (!starter) continue;
    const share = await soft(`${team} quarterback history`, () => nflPassShare(team, season, starter.name), { share: 1, attempts: 0, teamAttempts: 0 });
    const level = qbLevel(share.share);
    notes.push(`${team} quarterback: ${starter.name}, ${share.attempts} of ${share.teamAttempts} team attempts this season (${level})`);
    const d = applyQbDowngrade(r.game, team, level);
    r.game = d.game;
    if (d.change) r.changes.push(d.change);
  }
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

async function main(path: string, checkLive: boolean, checkConsensus: boolean): Promise<void> {
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
  if (checkConsensus) {
    const c = consensus(games, ticket.legs, { fastSims: Math.min(ticket.sims ?? 1_000_000, 1_000_000), pbpSims: 100_000, seed: ticket.seed });
    console.log(`\nconsensus (fast vs play-by-play, flag at ${(CONSENSUS_GAP * 100).toFixed(0)} points):`);
    console.log("leg".padEnd(46), "fast".padStart(7), "pbp".padStart(7), "mean".padStart(7), "");
    for (const l of c.legs) console.log(l.label.padEnd(46), pct(l.fast).padStart(7), pct(l.pbp).padStart(7), pct(l.mean).padStart(7), l.agree ? "  ok" : "  DROP: engines disagree");
    console.log(`all legs hit: fast ${pct(c.joint.fast)} · play-by-play ${pct(c.joint.pbp)} · mean ${pct(c.joint.mean)}`);
    if (c.drop.length) console.log(`drop ${c.drop.length} leg(s) before betting: ${c.drop.map((i) => c.legs[i].label).join("; ")}`);
    else console.log("both engines agree on every leg");
  }
}

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
if (!file) {
  console.error("usage: node --experimental-strip-types src/lib/sim/cli.ts ticket.json [--live] [--consensus]");
  process.exit(1);
}
await main(file, args.includes("--live"), args.includes("--consensus"));
