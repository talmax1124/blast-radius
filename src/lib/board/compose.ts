import type { SlipCard } from "../mlb/types.ts";
import type { NflBoard, NflMarket, NflPick } from "../nfl/types.ts";
import { marketLabel as nflMarketLabel } from "../nfl/slips.ts";
import type { NhlBoard, NhlSkater } from "../nhl/types.ts";
import type { BoardLeg, BoardSlip, HeatCell, Sport, SpotSize, TennisMatch } from "./types";

const SIZES: SpotSize[] = [2, 3, 4, 6];

export function clampP(p: number): number {
  if (!Number.isFinite(p)) return 0.5;
  return Math.min(0.92, Math.max(0.08, p));
}

/** Logistic on the log-rank gap. Rank 1 is the top of the tour. Capped: a ranking is not a price. */
export function rankWin(favoriteRank: number, otherRank: number): number {
  if (favoriteRank <= 0 || otherRank <= 0) return 0.5;
  const z = (Math.log(otherRank) - Math.log(favoriteRank)) * 0.85;
  const p = 1 / (1 + Math.exp(-z));
  return clampP(Math.min(0.88, p));
}

function legId(date: string, sport: Sport, gameId: string, playerId: string, market: string): string {
  return `${date}:${sport}:${gameId}:${playerId}:${market}`;
}

function nflStat(pick: NflPick, market: NflMarket): number | null {
  const box = pick.actual;
  if (!box?.played) return null;
  switch (market) {
    case "atd":
      return box.rushTd + box.recTd;
    case "pass":
      return box.passYd;
    case "rush":
      return box.rushYd;
    case "recyd":
      return box.recYd;
    case "rec":
      return box.rec;
    case "passtd":
      return box.passTd;
    case "fant":
      return null;
    default:
      return null;
  }
}

function settleOver(actual: number | null, line: number, final: boolean): "hit" | "miss" | null {
  if (!final || actual == null) return null;
  if (actual === line) return null;
  return actual > line ? "hit" : "miss";
}

export function nhlLegs(board: NhlBoard): BoardLeg[] {
  const out: BoardLeg[] = [];
  const markets: { key: string; label: string; prop: string; p: (s: NhlSkater) => number; note: (s: NhlSkater) => string }[] = [
    {
      key: "sog15",
      label: "Shots 1.5",
      prop: "Over 1.5 shots",
      p: (s) => s.pShots15,
      note: (s) => `${s.lambdaSog.toFixed(1)} projected shots. Career sample ${s.careerGp} games.`,
    },
    {
      key: "sog25",
      label: "Shots 2.5",
      prop: "Over 2.5 shots",
      p: (s) => s.pShots25,
      note: (s) => `${s.lambdaSog.toFixed(1)} projected shots. This is a step up from 1.5.`,
    },
    {
      key: "point",
      label: "Point",
      prop: "To record a point",
      p: (s) => s.pPoint,
      note: (s) => `${s.lambdaPts.toFixed(2)} projected points.`,
    },
    {
      key: "goal",
      label: "Goal",
      prop: "To score a goal",
      p: (s) => s.pGoal,
      note: (s) => `Shooting ${Math.round(s.shPct * 1000) / 10}%.`,
    },
  ];
  for (const s of board.skaters) {
    for (const m of markets) {
      const p = clampP(m.p(s));
      if (p < 0.5) continue;
      out.push({
        id: legId(board.date, "nhl", s.gameId, s.id, m.key),
        sport: "nhl",
        date: board.date,
        gameId: s.gameId,
        game: s.gameLabel,
        playerId: s.id,
        name: s.name,
        team: s.team,
        market: m.key,
        marketLabel: m.label,
        prop: m.prop,
        p,
        note: m.note(s),
        settled: null,
      });
    }
  }
  return out;
}

export function nflLegs(board: NflBoard): BoardLeg[] {
  const out: BoardLeg[] = [];
  const seen = new Set<string>();
  for (const pick of [...board.goalLine, ...board.props]) {
    const final = pick.gameState === "post";
    for (const quote of pick.quotes) {
      if (quote.cover == null || quote.cover < 0.5) continue;
      const id = legId(board.date, "nfl", pick.gameId, pick.id, quote.market);
      if (seen.has(id)) continue;
      seen.add(id);
      const actual = nflStat(pick, quote.market);
      out.push({
        id,
        sport: "nfl",
        date: board.date,
        gameId: pick.gameId,
        game: `${pick.team} at ${pick.opp}`,
        playerId: pick.id,
        name: pick.name,
        team: pick.team,
        market: quote.market,
        marketLabel: nflMarketLabel(quote.market),
        prop: `${quote.stat} over ${quote.line}`,
        p: clampP(quote.cover),
        note: `Projected ${quote.projection.toFixed(1)}.`,
        settled: settleOver(actual, quote.line, final),
      });
    }
  }
  return out;
}

export function mlbLegs(date: string, slips: SlipCard[]): BoardLeg[] {
  const out: BoardLeg[] = [];
  for (const slip of slips) {
    if (slip.skip) continue;
    for (const leg of slip.legs) {
      const settled = leg.result === "hit" || leg.result === "miss" ? leg.result : null;
      out.push({
        id: legId(date, "mlb", String(leg.gamePk ?? leg.playerId), String(leg.playerId), `${leg.market}:${leg.line}`),
        sport: "mlb",
        date,
        gameId: String(leg.gamePk ?? `${leg.teamAbbr}-${leg.opponentAbbr}`),
        game: `${leg.teamAbbr} vs ${leg.opponentAbbr}`,
        playerId: String(leg.playerId),
        name: leg.name,
        team: leg.teamAbbr,
        market: leg.market,
        marketLabel: leg.market.toUpperCase(),
        prop: `${leg.side === "over" ? "Over" : "Under"} ${leg.line} ${leg.stat}`,
        p: clampP(leg.cover),
        note: leg.reason,
        settled,
      });
    }
  }
  return out;
}

export function tennisLegs(date: string, matches: TennisMatch[]): BoardLeg[] {
  const out: BoardLeg[] = [];
  for (const match of matches) {
    if (match.state !== "pre") continue;
    const ranked = match.players.filter((p) => p.rank != null && p.rank > 0);
    if (ranked.length < 2) continue;
    const [a, b] = ranked;
    const fav = (a.rank ?? 999) <= (b.rank ?? 999) ? a : b;
    const dog = fav === a ? b : a;
    const p = rankWin(fav.rank ?? 999, dog.rank ?? 999);
    if (p < 0.6) continue;
    out.push({
      id: legId(date, "tennis", match.id, fav.name, "ml"),
      sport: "tennis",
      date,
      gameId: match.id,
      game: `${match.tour} · ${match.round}`,
      playerId: fav.name,
      name: fav.name,
      team: match.tour,
      market: "ml",
      marketLabel: "Match",
      prop: `To win vs ${dog.name}`,
      p,
      note: `Rank ${fav.rank} against rank ${dog.rank}. ${match.event}. Ranking only, no price.`,
      settled: null,
    });
  }
  return out.sort((x, y) => y.p - x.p);
}

export function takeLegs(pool: BoardLeg[], size: number, mix: boolean): BoardLeg[] | null {
  const sorted = [...pool].filter((l) => l.p >= 0.56 && l.settled == null).sort((a, b) => b.p - a.p);
  const usedGames = new Set<string>();
  const usedMarkets = new Set<string>();
  const chosen: BoardLeg[] = [];
  for (const leg of sorted) {
    if (chosen.length >= size) break;
    if (usedGames.has(leg.gameId)) continue;
    if (mix && usedMarkets.has(leg.market)) {
      const alt = sorted.some(
        (o) => !usedGames.has(o.gameId) && !usedMarkets.has(o.market) && o.p >= leg.p - 0.05,
      );
      if (alt) continue;
    }
    chosen.push(leg);
    usedGames.add(leg.gameId);
    usedMarkets.add(leg.market);
  }
  return chosen.length === size ? chosen : null;
}

export function sweepOf(legs: BoardLeg[]): number {
  return legs.reduce((p, leg) => p * leg.p, 1);
}

export function buildSlips(legs: BoardLeg[], sport: Sport | "all"): BoardSlip[] {
  const pool = sport === "all" ? legs : legs.filter((l) => l.sport === sport);
  const slips: BoardSlip[] = [];
  for (const size of SIZES) {
    for (const kind of ["power", "mix"] as const) {
      const picked = takeLegs(pool, size, kind === "mix");
      if (!picked) continue;
      const label = sport === "all" ? "All sports" : sport.toUpperCase();
      slips.push({
        id: `${sport}:${kind}:${size}`,
        sport,
        size,
        kind,
        title: `${label} ${size}-spot ${kind === "mix" ? "mix" : "power"}`,
        sweep: sweepOf(picked),
        legs: picked,
      });
    }
  }
  return slips;
}

export function recommended(slips: BoardSlip[], size: SpotSize): BoardSlip | null {
  const power = slips.find((s) => s.size === size && s.kind === "power");
  return power ?? slips.find((s) => s.size === size) ?? null;
}

export function heatCells(legs: BoardLeg[]): HeatCell[] {
  const best = new Map<string, BoardLeg>();
  for (const leg of legs) {
    const key = `${leg.game}||${leg.marketLabel}`;
    const prev = best.get(key);
    if (!prev || leg.p > prev.p) best.set(key, leg);
  }
  return [...best.values()]
    .map((leg) => ({
      row: leg.game,
      col: leg.marketLabel,
      p: leg.p,
      name: leg.name,
      prop: leg.prop,
    }))
    .sort((a, b) => a.row.localeCompare(b.row) || b.p - a.p);
}

export function tape(legs: BoardLeg[], market: string | null): BoardLeg[] {
  const pool = (market ? legs.filter((l) => l.market === market) : legs).slice().sort((a, b) => b.p - a.p);
  const seen = new Set<string>();
  const out: BoardLeg[] = [];
  for (const leg of pool) {
    const key = `${leg.gameId}:${leg.playerId}:${leg.market}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(leg);
    if (out.length >= 12) break;
  }
  return out;
}
