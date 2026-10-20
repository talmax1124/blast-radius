/**
 * Minutes Mass. An NBA prop is minutes times a per-minute rate.
 * Minutes shrink toward a position prior. Rates shrink the same way.
 * An over has to survive six minutes coming off. An under has to
 * survive four extra minutes and still be a dog to the number.
 * The cash number is the line we would buy. It is not a posted price.
 */

export type Pos = "G" | "F" | "C";
export type Market = "pts" | "reb" | "ast" | "threes" | "pra";

export const RIM = {
  version: "1.1",
  name: "Minutes Mass",
  shrinkGames: 10,
  formGames: 8,
  minuteCut: 6,
  minuteSpike: 4,
  minAfter: 0.55,
  maxOverAfter: 0.46,
  floorMinutes: 8,
  b2bMinutes: 0.96,
} as const;

const PRIOR: Record<Pos, { min: number; pts: number; reb: number; ast: number; threes: number }> = {
  G: { min: 28, pts: 0.52, reb: 0.12, ast: 0.17, threes: 0.08 },
  F: { min: 28, pts: 0.5, reb: 0.19, ast: 0.09, threes: 0.06 },
  C: { min: 26, pts: 0.48, reb: 0.28, ast: 0.07, threes: 0.03 },
};

export const CV: Record<Market, number> = {
  pts: 0.33,
  reb: 0.42,
  ast: 0.45,
  threes: 0.62,
  pra: 0.28,
};

export type Line = { min: number; pts: number; reb: number; ast: number; threes: number };

export type Quote = {
  market: Market;
  projection: number;
  cashOver: number | null;
  cashUnder: number | null;
  lean: "over" | "under" | "pass";
  cover: number | null;
};

export function shrink(season: number, prior: number, gp: number, k = RIM.shrinkGames): number {
  const played = Math.max(0, gp);
  const w = played / (played + k);
  return w * Math.max(0, season) + (1 - w) * Math.max(0, prior);
}

/** Opponent points allowed, clamped. Five games of a bad defense is not a 20% boost. */
export function defenseFactor(pointsAllowed: number, leagueAllowed: number): number {
  if (!(pointsAllowed > 0) || !(leagueAllowed > 0)) return 1;
  return Math.min(1.08, Math.max(0.92, pointsAllowed / leagueAllowed));
}

export type LoggedGame = {
  min: number;
  pts: number;
  reb: number;
  ast: number;
  threes: number;
  date: string;
  preseason: boolean;
};

/** Regular-season games only. Preseason and the playoffs do not move the rate. */
export function recentForm(games: LoggedGame[]): { line: Line; gp: number; lastDate: string | null } {
  const dated = games.filter((game) => game.date);
  const last = dated.sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const reg = games.filter((game) => !game.preseason && game.min > 0);
  if (!reg.length) return { line: { min: 0, pts: 0, reb: 0, ast: 0, threes: 0 }, gp: 0, lastDate: last?.date ?? null };
  const gp = reg.length;
  const avg = (key: "min" | "pts" | "reb" | "ast" | "threes") => reg.reduce((sum, game) => sum + game[key], 0) / gp;
  return { line: { min: avg("min"), pts: avg("pts"), reb: avg("reb"), ast: avg("ast"), threes: avg("threes") }, gp, lastDate: last?.date ?? null };
}

export function isBackToBack(lastDate: string | null, tipIso: string): boolean {
  if (!lastDate) return false;
  const last = Date.parse(lastDate);
  const tip = Date.parse(tipIso);
  if (!Number.isFinite(last) || !Number.isFinite(tip)) return false;
  const hours = (tip - last) / 36e5;
  return hours > 0 && hours < 36;
}

function cellOf(stats: string[], names: string[], key: string): number {
  const i = names.indexOf(key);
  if (i < 0) return 0;
  const n = Number(String(stats[i] ?? "").split("-")[0]);
  return Number.isFinite(n) ? n : 0;
}

/** Regular season counts. Preseason and playoffs are dropped before the rate is touched. */
export function gamesFromLog(input: {
  names?: string[];
  seasonTypes?: { displayName?: string; categories?: { events?: { eventId?: string; stats?: string[] }[] }[] }[];
  events?: Record<string, { gameDate?: string }>;
}): LoggedGame[] {
  const names = input.names ?? [];
  const games: LoggedGame[] = [];
  for (const type of input.seasonTypes ?? []) {
    const label = (type.displayName ?? "").toLowerCase();
    if (label.includes("post")) continue;
    const preseason = !label.includes("regular");
    for (const category of type.categories ?? []) {
      for (const event of category.events ?? []) {
        const stats = event.stats ?? [];
        const min = cellOf(stats, names, "minutes");
        if (!(min > 0)) continue;
        games.push({
          min,
          pts: cellOf(stats, names, "points"),
          reb: cellOf(stats, names, "totalRebounds"),
          ast: cellOf(stats, names, "assists"),
          threes: cellOf(stats, names, "threePointFieldGoalsMade-threePointFieldGoalsAttempted"),
          date: (event.eventId && input.events?.[event.eventId]?.gameDate) || "",
          preseason,
        });
      }
    }
  }
  return games;
}

export function normCdf(z: number): number {
  if (!Number.isFinite(z)) return z > 0 ? 1 : 0;
  const az = Math.abs(z);
  const t = 1 / (1 + 0.2316419 * az);
  const d = 0.3989422804014327 * Math.exp((-az * az) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const lo = Math.min(1, Math.max(0, p));
  return z >= 0 ? 1 - lo : lo;
}

export function coverOver(mean: number, line: number, market: Market): number {
  if (!(mean > 0)) return line <= 0 ? 1 : 0;
  const floor = market === "threes" ? 0.9 : 1.5;
  const sd = Math.max(floor, mean * CV[market]);
  const z = (line - mean) / sd;
  return Math.min(0.99, Math.max(0.01, 1 - normCdf(z)));
}

function perMinute(total: number, minutes: number, prior: number): number {
  if (!(minutes > 0)) return prior;
  return Math.max(0, total) / minutes;
}

function cush(market: Market): number {
  if (market === "threes") return 0.5;
  if (market === "pra") return 3;
  return 2;
}

/** A minute cut always lowers the number. If it falls this far, the posted line is not live. */
function maxGap(market: Market): number {
  if (market === "threes") return 0.8;
  if (market === "pra") return 4;
  if (market === "reb" || market === "ast") return 1.5;
  return 4;
}

function minLine(market: Market): number {
  if (market === "threes") return 1.5;
  if (market === "reb" || market === "ast") return 2.5;
  if (market === "pra") return 19.5;
  return 12.5;
}

function cashOver(mean: number, shocked: number, market: Market): { line: number; cover: number } | null {
  let line = Math.floor(mean) + 0.5;
  for (let i = 0; i < 40 && line >= 0.5; i++) {
    const cover = coverOver(shocked, line, market);
    if (cover >= RIM.minAfter) return { line, cover };
    line -= 1;
  }
  return null;
}

function cashUnder(mean: number, spiked: number, market: Market): number | null {
  let line = Math.floor(mean) + 0.5;
  for (let i = 0; i < 40; i++) {
    if (spiked < line && coverOver(spiked, line, market) <= RIM.maxOverAfter) return line;
    line += 1;
  }
  return null;
}

function quote(market: Market, minutes: number, rate: number, venue: number): Quote {
  const mean = minutes * rate * venue;
  const shockedMin = Math.max(RIM.floorMinutes, minutes - RIM.minuteCut);
  const shocked = shockedMin * rate * venue;
  const spiked = (minutes + RIM.minuteSpike) * rate * venue;
  const over = cashOver(mean, shocked, market);
  const under = cashUnder(mean, spiked, market);
  const overGap = over == null ? Infinity : mean - over.line;
  const underGap = under == null ? Infinity : under - mean;
  const overLean = over != null && over.line >= minLine(market) && overGap <= maxGap(market);
  const underLean = under != null && minutes >= 28 && underGap >= cush(market) && underGap <= maxGap(market);
  const lean = overLean && underLean ? (overGap <= underGap ? "over" : "under") : overLean ? "over" : underLean ? "under" : "pass";
  return {
    market,
    projection: mean,
    cashOver: over?.line ?? null,
    cashUnder: under,
    lean,
    cover: lean === "over" ? (over?.cover ?? null) : null,
  };
}

export function projectPlayer(input: {
  pos: Pos;
  gp: number;
  season: Line;
  careerGp: number;
  career: Line;
  home: boolean;
  recent?: Line | null;
  recentGp?: number;
  defense?: number;
  backToBack?: boolean;
}): { minutes: number; quotes: Record<Market, Quote> } {
  const prior = PRIOR[input.pos];
  const careerMin = input.career.min > 0 ? input.career.min : prior.min;
  const seasonMin = input.season.min > 0 ? input.season.min : careerMin;
  let minutes = shrink(seasonMin, shrink(careerMin, prior.min, input.careerGp), input.gp);
  const rateOf = (key: "pts" | "reb" | "ast" | "threes") => {
    const careerRate = perMinute(input.career[key], input.career.min, prior[key]);
    const seasonRate = perMinute(input.season[key], input.season.min, careerRate);
    return shrink(seasonRate, shrink(careerRate, prior[key], input.careerGp), input.gp);
  };
  let pts = rateOf("pts");
  let reb = rateOf("reb");
  let ast = rateOf("ast");
  let threes = rateOf("threes");
  const recentGp = input.recentGp ?? 0;
  if (recentGp > 0 && input.recent && input.recent.min > 0) {
    minutes = shrink(input.recent.min, minutes, recentGp, RIM.formGames);
    const mix = (base: number, total: number) => shrink(perMinute(total, input.recent!.min, base), base, recentGp, RIM.formGames);
    pts = mix(pts, input.recent.pts);
    reb = mix(reb, input.recent.reb);
    ast = mix(ast, input.recent.ast);
    threes = mix(threes, input.recent.threes);
  }
  if (input.backToBack) minutes *= RIM.b2bMinutes;
  const defense = input.defense ?? 1;
  const mild = 1 + (defense - 1) * 0.45;
  const venue = (input.home ? 1.015 : 0.985) * defense;
  const quotes = {
    pts: quote("pts", minutes, pts, venue),
    reb: quote("reb", minutes, reb, mild),
    ast: quote("ast", minutes, ast, mild),
    threes: quote("threes", minutes, threes, venue),
    pra: quote("pra", minutes, pts * venue + reb * mild + ast * mild, 1),
  };
  return { minutes, quotes };
}

export type CardLeg = {
  id: string;
  name: string;
  team: string;
  gameId: string;
  market: Market;
  projection: number;
  line: number;
  cover: number;
};

export function buildCard(
  rows: { id: string; name: string; team: string; gameId: string; minutes: number; quotes: Record<Market, Quote> }[],
): CardLeg[] {
  const legs: CardLeg[] = [];
  const games = new Set<string>();
  const ranked = rows
    .filter((row) => row.minutes >= 26)
    .flatMap((row) =>
      (["pts", "reb", "ast", "threes", "pra"] as Market[]).map((market) => ({ row, market, quote: row.quotes[market] })),
    )
    .filter((item) => item.quote.lean === "over" && item.quote.cashOver != null && item.quote.cover != null)
    .sort((a, b) => {
      const gapA = a.quote.projection - (a.quote.cashOver ?? 0);
      const gapB = b.quote.projection - (b.quote.cashOver ?? 0);
      return gapA - gapB || (b.quote.cover ?? 0) - (a.quote.cover ?? 0);
    });
  for (const item of ranked) {
    if (legs.length === 3) break;
    if (games.has(item.row.gameId)) continue;
    if (legs.some((leg) => leg.id === item.row.id)) continue;
    games.add(item.row.gameId);
    legs.push({
      id: item.row.id,
      name: item.row.name,
      team: item.row.team,
      gameId: item.row.gameId,
      market: item.market,
      projection: item.quote.projection,
      line: item.quote.cashOver ?? 0,
      cover: item.quote.cover ?? 0,
    });
  }
  return legs.length >= 2 ? legs : [];
}
