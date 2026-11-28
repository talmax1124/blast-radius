import { simulateTicket, type Leg, type SimGame, type TicketReport } from "./ticket.ts";

/**
 * Run a ticket through both engines and keep only the legs they agree on.
 *
 * The fast engine prices each player from his own projection; the play-by-play engine makes every
 * team's scoring add up to the market total and plays the minutes out possession by possession. When
 * they differ on a leg by more than CONSENSUS_GAP, one of the inputs is off (an inflated projection,
 * a role the model has wrong) and the leg is a coin flip on which engine is right. On Nov 6 the fast
 * engine had Maxey over 25.5 at 55% and Luka over 6.5 assists at 59%; play-by-play had 29% and 39%.
 * Both missed (17 points, 5 assists). Dropping legs like these is cheaper than picking a side.
 *
 * There is no NHL play-by-play engine yet. An NHL game's "pbp" run is the fast engine again on another
 * seed, so its legs only disagree by sampling noise and the report says so in `notes`. That keeps a mixed
 * ticket's structure intact, but it is not a second opinion on NHL legs.
 */

/** Seed offset for the second run when a ticket has an NHL game, so the fast engine is not just replayed. */
export const NHL_SECOND_SEED = 7919;

export const CONSENSUS_GAP = 0.1;

export type ConsensusLeg = {
  label: string;
  fast: number;
  pbp: number;
  /** Mean of the two engines: the number recorded in the book. */
  mean: number;
  gap: number;
  agree: boolean;
};

export type ConsensusReport = {
  legs: ConsensusLeg[];
  fast: TicketReport;
  pbp: TicketReport;
  /** Indexes of legs to keep and to drop. */
  keep: number[];
  drop: number[];
  /** Joint chance of the whole ticket in each engine, and their mean. */
  joint: { fast: number; pbp: number; mean: number };
  /** Caveats about the comparison, such as sports with no play-by-play engine. */
  notes: string[];
};

export function classify(fast: number[], pbp: number[], labels: string[], gap = CONSENSUS_GAP): ConsensusLeg[] {
  return fast.map((f, i) => {
    const p = pbp[i];
    const g = Math.abs(f - p);
    return { label: labels[i], fast: f, pbp: p, mean: (f + p) / 2, gap: g, agree: g <= gap };
  });
}

export function consensus(
  games: SimGame[],
  legs: Leg[],
  opts: { fastSims?: number; pbpSims?: number; seed?: number; gap?: number } = {},
): ConsensusReport {
  const fast = simulateTicket(games, legs, { sims: opts.fastSims ?? 1_000_000, seed: opts.seed, engine: "fast" });
  const hasNhl = games.some((g) => g.sport === "nhl");
  const pbp = simulateTicket(games, legs, { sims: opts.pbpSims ?? 100_000, seed: hasNhl ? (opts.seed ?? 7) + NHL_SECOND_SEED : opts.seed, engine: "pbp" });
  const rows = classify(
    fast.legs.map((l) => l.sim),
    pbp.legs.map((l) => l.sim),
    fast.legs.map((l) => l.label),
    opts.gap,
  );
  return {
    legs: rows,
    fast,
    pbp,
    keep: rows.flatMap((r, i) => (r.agree ? [i] : [])),
    drop: rows.flatMap((r, i) => (r.agree ? [] : [i])),
    joint: { fast: fast.joint, pbp: pbp.joint, mean: (fast.joint + pbp.joint) / 2 },
    notes: hasNhl ? ["NHL has no play-by-play engine yet: its legs' pbp column is the fast engine on a second seed."] : [],
  };
}
