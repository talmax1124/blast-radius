import { clampP } from "./compose.ts";
import { americanProb, buildPrice, devig, formatAmerican, type PriceCard } from "./odds.ts";
import type { BoardLeg, Sport } from "./types.ts";

export type SlateGame = {
  id: string;
  sport: Sport;
  label: string;
  state: "pre" | "in" | "post";
  priced: boolean;
  note: string;
};

export type SlateBoard = {
  date: string;
  games: SlateGame[];
  legs: BoardLeg[];
  aside: string[];
  prices: PriceCard[];
};

export { americanProb, devig };

function oddsNumber(node: unknown): number | null {
  if (typeof node === "number" && Number.isFinite(node) && node !== 0) return node;
  if (!node || typeof node !== "object") return null;
  const row = node as { close?: { odds?: string }; open?: { odds?: string }; odds?: string; moneyLine?: number };
  if (typeof row.moneyLine === "number" && row.moneyLine !== 0) return row.moneyLine;
  const raw = row.close?.odds ?? row.open?.odds ?? row.odds;
  if (!raw) return null;
  const n = Number(String(raw).replace(/^\+/, ""));
  return Number.isFinite(n) && n !== 0 ? n : null;
}

function stateOf(raw: string | undefined): "pre" | "in" | "post" {
  if (raw === "in") return "in";
  if (raw === "post") return "post";
  return "pre";
}

type Side = { name: string; abbr: string; odds: number | null; score: number | null };

function sideOf(raw: unknown): Side | null {
  const row = raw as {
    score?: string | number;
    team?: { displayName?: string; abbreviation?: string; shortDisplayName?: string };
  };
  const name = row.team?.shortDisplayName || row.team?.displayName;
  const abbr = row.team?.abbreviation;
  if (!name || !abbr) return null;
  const score = row.score == null || row.score === "" ? null : Number(row.score);
  return { name, abbr, odds: null, score: Number.isFinite(score) ? score : null };
}

export function parseScoreboard(payload: unknown, sport: Sport, date: string): { games: SlateGame[]; legs: BoardLeg[]; prices: PriceCard[] } {
  const events = (payload as { events?: unknown[] }).events ?? [];
  const games: SlateGame[] = [];
  const legs: BoardLeg[] = [];
  const prices: PriceCard[] = [];
  for (const event of events) {
    const ev = event as { id?: string; competitions?: unknown[] };
    const comp = (ev.competitions?.[0] ?? null) as {
      id?: string;
      status?: { type?: { state?: string } };
      competitors?: unknown[];
      odds?: {
        details?: string;
        overUnder?: number;
        moneyline?: { home?: unknown; away?: unknown };
        drawOdds?: unknown;
      }[];
    } | null;
    if (!comp) continue;
    const teams = (comp.competitors ?? []).map(sideOf).filter((s): s is Side => s != null);
    const homeRaw = (comp.competitors ?? []).find((c) => (c as { homeAway?: string }).homeAway === "home");
    const awayRaw = (comp.competitors ?? []).find((c) => (c as { homeAway?: string }).homeAway === "away");
    const home = homeRaw ? sideOf(homeRaw) : teams[0];
    const away = awayRaw ? sideOf(awayRaw) : teams[1];
    if (!home || !away) continue;
    const quote = comp.odds?.[0];
    home.odds = oddsNumber(quote?.moneyline?.home);
    away.odds = oddsNumber(quote?.moneyline?.away);
    const draw = oddsNumber(quote?.drawOdds);
    const id = String(comp.id ?? ev.id ?? `${sport}-${away.abbr}-${home.abbr}`);
    const state = stateOf(comp.status?.type?.state);
    const priced = home.odds != null && away.odds != null;
    const spread = quote?.details ? String(quote.details) : "";
    const total = quote?.overUnder != null ? `Total ${quote.overUnder}` : "";
    const note = [spread, total].filter(Boolean).join(" · ");
    games.push({
      id,
      sport,
      label: `${away.abbr} @ ${home.abbr}`,
      state,
      priced,
      note: note || "No price posted",
    });
    if (!priced || state !== "pre") {
      continue;
    }
    const named = [
      { name: away.name, american: away.odds as number },
      { name: home.name, american: home.odds as number },
    ];
    if (draw != null) named.push({ name: "Draw", american: draw });
    const card = buildPrice({
      id,
      sport,
      label: `${away.abbr} @ ${home.abbr}`,
      spread: spread || null,
      total: quote?.overUnder ?? null,
      sides: named,
    });
    if (card && state === "pre") prices.push(card);
    const book = [
      { side: away, odds: away.odds as number },
      { side: home, odds: home.odds as number },
    ];
    const raw = book.map((row) => americanProb(row.odds));
    if (draw != null) raw.push(americanProb(draw));
    const fair = devig(raw);
    let best = 0;
    if (fair[1] > fair[0]) best = 1;
    const pick = book[best];
    const p = clampP(fair[best] ?? 0);
    if (p < 0.48) continue;
    const price = formatAmerican(pick.odds);
    legs.push({
      id: `${date}:${sport}:${id}:${pick.side.abbr}:ml`,
      sport,
      date,
      gameId: id,
      game: `${away.abbr} @ ${home.abbr}`,
      playerId: pick.side.abbr,
      name: pick.side.name,
      team: pick.side.abbr,
      market: "ml",
      marketLabel: "Moneyline",
      prop: "To win",
      p,
      note: `No-vig ${price}. ${note || "Moneyline only."} This is the book price with the juice taken out, not a model edge.`,
      settled: null,
    });
  }
  return { games, legs, prices };
}

/** Leaderboard only. No outright price means no slip. */
export function golfLine(payload: unknown): string | null {
  const event = ((payload as { events?: unknown[] }).events ?? [])[0] as
    | {
        name?: string;
        competitions?: {
          status?: { type?: { shortDetail?: string } };
          competitors?: { score?: string; athlete?: { displayName?: string } }[];
        }[];
      }
    | undefined;
  const comp = event?.competitions?.[0];
  const leaders = (comp?.competitors ?? [])
    .map((row) => ({ name: row.athlete?.displayName?.trim() ?? "", score: row.score ?? "" }))
    .filter((row) => row.name)
    .slice(0, 3);
  if (!event?.name || leaders.length === 0) return null;
  const names = leaders.map((row) => (row.score ? `${row.name} ${row.score}` : row.name)).join(", ");
  const detail = comp?.status?.type?.shortDetail;
  return `Golf · ${event.name} · ${names}.${detail ? ` ${detail}.` : ""} No outright price, so it stays off the card.`;
}
