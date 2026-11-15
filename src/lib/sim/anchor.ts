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
