import type { NbaGameIn } from "./nba.ts";
import type { NflGameIn } from "./nfl.ts";
import { normName } from "./roster.ts";

/**
 * Pulls each player's projection toward the book's posted line before a sim runs.
 *
 * The book's main line is close to the market's median for that stat, and it already knows things the
 * season averages do not: a new role after a trade or injury, a minutes limit, a coach's rotation. Four
 * graded nights (Nov 10-14) showed the model's biggest disagreements with those lines were mostly its own
 * input errors (Horford, Queen, Eason minutes; Helm and Parker Washington targets). Anchoring keeps the
 * sim's correlation structure (one player's big night costs a teammate's) but centers each stat between
 * the projection and the line. `weight` is how much of the projection survives: 1 ignores the book, 0
 * copies it.
 */

export type BookLine = { name: string; stat: string; line: number };
export type AnchorMove = { name: string; stat: string; from: number; to: number };

const NBA_STATS = ["pts", "reb", "ast", "threes"] as const;

export function anchorNba(game: NbaGameIn, lines: BookLine[], weight = 0.5): { game: NbaGameIn; moves: AnchorMove[] } {
  const by = new Map<string, Map<string, number>>();
  for (const l of lines) {
    const k = normName(l.name);
    if (!by.has(k)) by.set(k, new Map());
    by.get(k)!.set(l.stat, l.line);
  }
  const moves: AnchorMove[] = [];
  const players = game.players.map((p) => {
    const ls = by.get(normName(p.name));
    if (!ls) return p;
    const q = { ...p };
    for (const s of NBA_STATS) {
      const line = ls.get(s);
      if (line == null || !(p[s] > 0)) continue;
      const to = weight * p[s] + (1 - weight) * line;
      moves.push({ name: p.name, stat: s, from: p[s], to });
      q[s] = to;
    }
    // A PRA line with no single-stat lines moves points, rebounds and assists together.
    const pra = ls.get("pra");
    if (pra != null && !NBA_STATS.slice(0, 3).some((s) => ls.has(s))) {
      const sum = p.pts + p.reb + p.ast;
      if (sum > 0) {
        const f = (weight * sum + (1 - weight) * pra) / sum;
        moves.push({ name: p.name, stat: "pra", from: sum, to: sum * f });
        q.pts *= f; q.reb *= f; q.ast *= f;
      }
    }
    // Minutes follow the scoring move, so the play-by-play engine's per-minute rates stay realistic.
    const ptsMove = ls.has("pts") && p.pts > 0 ? q.pts / p.pts : null;
    if (ptsMove) q.minutes = Math.min(42, p.minutes * Math.sqrt(ptsMove));
    return q;
  });
  return { game: { ...game, players }, moves };
}

export function anchorNfl(game: NflGameIn, lines: BookLine[], weight = 0.5): { game: NflGameIn; moves: AnchorMove[] } {
  const by = new Map<string, Map<string, number>>();
  for (const l of lines) {
    const k = normName(l.name);
    if (!by.has(k)) by.set(k, new Map());
    by.get(k)!.set(l.stat, l.line);
  }
  const moves: AnchorMove[] = [];
  const pull = (q: any, name: string, stat: string, line: number | undefined, partner?: string) => {
    const v = q[stat];
    if (line == null || !(v > 0)) return;
    const to = weight * v + (1 - weight) * line;
    moves.push({ name, stat, from: v, to });
    q[stat] = to;
    // Volume moves with production: more catches means more targets, more rush yards more carries.
    if (partner && q[partner] > 0) q[partner] *= to / v;
  };
  const players = game.players.map((p) => {
    const ls = by.get(normName(p.name));
    if (!ls) return p;
    const q: any = { ...p };
    pull(q, p.name, "rec", ls.get("rec"), "targets");
    pull(q, p.name, "recYd", ls.get("recYd"));
    pull(q, p.name, "rushYd", ls.get("rushYd"), "rushAtt");
    pull(q, p.name, "passYd", ls.get("passYd"));
    return q;
  });
  return { game: { ...game, players }, moves };
}

/** How much of the projection survives the pull toward the book's line (backtest: Nov 10-14, 1,345 NBA props). */
export const ANCHOR_WEIGHT = 0.2;
/** Share of the final chance that comes from the anchored sim; the rest is the no-vig market. */
export const MODEL_SHARE = 0.3;

/**
 * The chance a card should use. Backtest over the four graded nights (Brier, lower is better): market 0.2486,
 * raw sim 0.2576, anchored sim 0.2509, anchored sim blended 30/70 with the market 0.2482.
 */
export function finalChance(sim: number, market: number | null, share = MODEL_SHARE): number {
  return market == null ? sim : share * sim + (1 - share) * market;
}

/**
 * Books set a main line near the median of the stat, not its mean, and counting stats are right-skewed, so
 * a sim whose mean equals the line still leans under. This moves each lined stat until the sim's own
 * P(over the line) is 50%, a few rounds of the fast engine, so "anchored" means centered on the line.
 * `run(game, legs)` returns P(over) for each leg; it is passed in so this file does not import the engines.
 */
export function centerOnLines<G extends { players: any[] }>(
  game: G, lines: BookLine[], run: (game: G, legs: { player: string; stat: string; line: number }[]) => number[], rounds = 3, strength = 1,
): G {
  const map: Record<string, string> = { pts: "pts", reb: "reb", ast: "ast", threes: "threes", rec: "rec", recYd: "recYd", rushYd: "rushYd", passYd: "passYd" };
  const names = new Set(game.players.map((p) => normName(p.name)));
  const ls = lines.filter((l) => map[l.stat] && names.has(normName(l.name)));
  let g: G = { ...game, players: game.players.map((p) => ({ ...p })) };
  for (let r = 0; r < rounds && ls.length; r++) {
    const pOver = run(g, ls.map((l) => ({ player: l.name, stat: l.stat, line: l.line })));
    ls.forEach((l, k) => {
      const p = g.players.find((x) => normName(x.name) === normName(l.name));
      const v = p?.[map[l.stat]];
      if (!p || !(v > 0)) return;
      // Nudge the mean up when the sim leans under and down when it leans over; 0.8 damps overshoot.
      const f = Math.min(1.6, Math.max(0.6, 1 + strength * 0.8 * (0.5 - pOver[k]) * (l.stat === "threes" || l.stat === "rec" ? 0.9 : 0.5)));
      p[map[l.stat]] = v * f;
      if (l.stat === "rec" && p.targets > 0) p.targets *= f;
      if (l.stat === "rushYd" && p.rushAtt > 0) p.rushAtt *= f;
    });
  }
  return g;
}

/**
 * Removes a slate's shared tilt: the average gap between sim and market on each game's over legs is taken
 * off every leg in that game (added back on unders). What is left is the player-by-player difference.
 */
export function debiasSlate<T extends { game: string; side: "over" | "under"; sim: number; market: number }>(rows: T[]): (T & { centered: number })[] {
  const off = new Map<string, number>();
  for (const g of new Set(rows.map((r) => r.game))) {
    const o = rows.filter((r) => r.game === g && r.side === "over");
    off.set(g, o.length ? o.reduce((a, r) => a + r.sim - r.market, 0) / o.length : 0);
  }
  return rows.map((r) => {
    const d = off.get(r.game) ?? 0;
    const c = r.side === "over" ? r.sim - d : r.sim + d;
    return { ...r, centered: Math.min(0.97, Math.max(0.03, c)) };
  });
}
