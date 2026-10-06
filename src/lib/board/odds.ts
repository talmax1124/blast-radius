import type { Sport } from "./types.ts";

export type PriceSide = {
  name: string;
  american: number;
  raw: number;
  fair: number;
};

export type PriceCard = {
  id: string;
  sport: Sport;
  label: string;
  spread: string | null;
  total: number | null;
  hold: number;
  sides: PriceSide[];
  favorite: string;
  fair: number;
  american: number;
  read: string;
};

export type OddsBrief = {
  n: number;
  hold: number | null;
  lines: string[];
};

export function americanProb(odds: number): number {
  if (!Number.isFinite(odds) || odds === 0) return 0.5;
  return odds < 0 ? -odds / (-odds + 100) : 100 / (odds + 100);
}

export function devig(probs: number[]): number[] {
  const sum = probs.reduce((total, p) => total + p, 0);
  if (sum <= 0) return probs.map(() => 0);
  return probs.map((p) => p / sum);
}

export function formatAmerican(odds: number): string {
  if (!Number.isFinite(odds) || odds === 0) return "—";
  return odds > 0 ? `+${odds}` : String(odds);
}

export function buildPrice(input: {
  id: string;
  sport: Sport;
  label: string;
  spread?: string | null;
  total?: number | null;
  sides: { name: string; american: number }[];
}): PriceCard | null {
  const sides = input.sides.filter((side) => Number.isFinite(side.american) && side.american !== 0);
  if (sides.length < 2) return null;
  const raw = sides.map((side) => americanProb(side.american));
  const fair = devig(raw);
  const priced: PriceSide[] = sides.map((side, i) => ({
    name: side.name,
    american: side.american,
    raw: raw[i] ?? 0,
    fair: fair[i] ?? 0,
  }));
  const hold = raw.reduce((sum, p) => sum + p, 0) - 1;
  let lead = priced[0];
  for (const side of priced) if (side.fair > lead.fair) lead = side;
  const card: PriceCard = {
    id: input.id,
    sport: input.sport,
    label: input.label,
    spread: input.spread ?? null,
    total: input.total ?? null,
    hold,
    sides: priced,
    favorite: lead.name,
    fair: lead.fair,
    american: lead.american,
    read: "",
  };
  card.read = readPrice(card);
  return card;
}

export function readPrice(card: PriceCard): string {
  const fair = `${Math.round(card.fair * 100)}%`;
  const hold = `${(card.hold * 100).toFixed(1)}`;
  const price = formatAmerican(card.american);
  const draw = card.sides.length > 2 ? [...card.sides].sort((a, b) => b.fair - a.fair)[1] : null;
  if (card.fair < 0.5) {
    return `No team is a favorite. Best no-vig number is ${fair}. The draw is doing the work.`;
  }
  if (card.hold >= 0.07) {
    return `${card.favorite} is ${price}, ${fair} after the juice. The book keeps ${hold} points. That is an expensive ticket.`;
  }
  if (card.fair >= 0.68) {
    return `Short price. ${card.favorite} is ${fair} no-vig off ${price}. Hold is ${hold} points.`;
  }
  if (draw && draw.fair + 0.08 >= card.fair) {
    return `${card.favorite} leads at ${fair}, but the next number is close. The gap is smaller than it looks at ${price}.`;
  }
  if (card.fair < 0.56) {
    return `Modest. ${card.favorite} is ${fair} once ${price} is stripped of a ${hold}-point hold.`;
  }
  return `${card.favorite} is ${fair} no-vig off ${price}. Hold is ${hold} points.`;
}

export function parseAmerican(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const n = Number(String(raw).replace(/^\+/, "").trim());
  return Number.isFinite(n) && n !== 0 ? n : null;
}

export function spreadWin(points: number): number {
  const p = 0.5 + Math.abs(points) * 0.03;
  return Math.min(0.8, Math.max(0.5, p));
}

export function spreadRead(label: string): { favorite: string; points: number; fair: number; read: string } | null {
  const match = label.match(/([A-Z]{2,4})\s+(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const points = Math.abs(Number(match[2]));
  if (!Number.isFinite(points)) return null;
  const fair = spreadWin(points);
  return {
    favorite: match[1],
    points,
    fair,
    read: `${match[1]} by ${points}. A spread of that size wins about ${Math.round(fair * 100)}% of the time. That is a conversion, not a posted moneyline.`,
  };
}

export function oddsBrief(cards: PriceCard[]): OddsBrief {
  if (!cards.length) {
    return { n: 0, hold: null, lines: ["No posted moneyline on this cut."] };
  }
  const hold = cards.reduce((sum, card) => sum + card.hold, 0) / cards.length;
  const dearest = [...cards].sort((a, b) => b.hold - a.hold)[0];
  const shortest = [...cards].sort((a, b) => b.fair - a.fair)[0];
  const draws = cards.filter((card) => card.fair < 0.55 && card.sides.length > 2).length;
  const lines = [
    `${cards.length} posted prices. The book keeps ${(hold * 100).toFixed(1)} points on average.`,
    `Shortest favorite: ${shortest.sport.toUpperCase()} ${shortest.favorite} at ${Math.round(shortest.fair * 100)}% no-vig (${formatAmerican(shortest.american)}).`,
    `Highest hold: ${dearest.sport.toUpperCase()} ${dearest.label} at ${(dearest.hold * 100).toFixed(1)} points.`,
  ];
  if (draws > 0) {
    lines.push(`${draws} soccer prices have no side at 55% once the draw is removed.`);
  }
  return { n: cards.length, hold, lines };
}
