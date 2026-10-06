import { getSql } from "@/lib/db";
import { juiceFloor } from "./ev";
import { namesMatch } from "./parse";
import type { PpProjection } from "./prizepicks.server";
import { coverProb } from "./slips";
import type { BatterPick, DeskNews, PitcherPick, SlipCard, WireBoard, WireQuote } from "./types";
import { cardKeys, clvPoints, emptyWire, quoteKey, steamOf } from "./wire";

type QuoteRow = {
  quote_key: string;
  name: string;
  team_abbr: string;
  opponent_abbr: string;
  market: string;
  odds_type: string;
  open_line: string | number;
  last_line: string | number;
  prev_line: string | number | null;
  close_line: string | number | null;
  ticks: number;
};

function num(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function fromRow(row: QuoteRow): WireQuote {
  return {
    key: row.quote_key,
    name: row.name,
    teamAbbr: row.team_abbr,
    opponentAbbr: row.opponent_abbr,
    market: row.market as WireQuote["market"],
    oddsType: row.odds_type as WireQuote["oddsType"],
    openLine: num(row.open_line) ?? 0,
    lastLine: num(row.last_line) ?? 0,
    prevLine: num(row.prev_line),
    closeLine: num(row.close_line),
    ticks: Number(row.ticks) || 1,
  };
}

export async function loadQuotes(date: string): Promise<WireQuote[]> {
  const sql = await getSql();
  const rows = await sql<QuoteRow>`
    select quote_key, name, team_abbr, opponent_abbr, market, odds_type,
           open_line, last_line, prev_line, close_line, ticks
    from desk_quotes
    where quote_date = ${date}::date
  `;
  return rows.map(fromRow);
}

export async function snapshotQuotes(date: string, lines: PpProjection[], started: boolean): Promise<WireQuote[]> {
  if (!lines.length) return loadQuotes(date);
  const sql = await getSql();
  for (const line of lines) {
    const key = quoteKey(line.name, line.market, line.oddsType);
    const close = started ? line.line : null;
    await sql`
      insert into desk_quotes (
        quote_date, quote_key, name, team_abbr, opponent_abbr, market, odds_type,
        open_line, last_line, prev_line, close_line, ticks, moved_at, closed_at
      )
      values (
        ${date}::date,
        ${key},
        ${line.name},
        ${line.teamAbbr},
        ${line.opponentAbbr},
        ${line.market},
        ${line.oddsType},
        ${line.line},
        ${line.line},
        null,
        ${close},
        1,
        now(),
        ${started ? new Date().toISOString() : null}::timestamptz
      )
      on conflict (quote_date, quote_key) do update set
        prev_line = desk_quotes.last_line,
        last_line = excluded.last_line,
        ticks = desk_quotes.ticks + 1,
        team_abbr = excluded.team_abbr,
        opponent_abbr = excluded.opponent_abbr,
        moved_at = case
          when excluded.last_line is distinct from desk_quotes.last_line then now()
          else desk_quotes.moved_at
        end,
        close_line = coalesce(desk_quotes.close_line, excluded.close_line),
        closed_at = coalesce(desk_quotes.closed_at, excluded.closed_at)
    `;
  }
  return loadQuotes(date);
}

function lastName(name: string): string {
  return name.split(" ").filter(Boolean).slice(-1)[0] ?? name;
}

function matchQuote(quotes: WireQuote[], name: string, market: string, oddsType: string): WireQuote | undefined {
  const key = quoteKey(name, market, oddsType);
  const exact = quotes.find((q) => q.key === key);
  if (exact) return exact;
  return quotes.find((q) => q.market === market && q.oddsType === oddsType && namesMatch(q.name, name));
}

export function buildWire(opts: {
  picks: Array<BatterPick | PitcherPick>;
  slips: SlipCard[];
  quotes: WireQuote[];
  news?: DeskNews[];
}): WireBoard {
  const { picks, slips, quotes, news = [] } = opts;
  const onCard = cardKeys(slips);
  const seen = new Set<string>();
  const rows = [];

  for (const pick of picks) {
    const line = pick.propLine;
    if (!line) continue;
    const id = `${pick.playerId}|${pick.market}|${line.oddsType}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const cover = coverProb(pick, line);
    const juice = juiceFloor(line.oddsType);
    const edge = cover - juice;
    const quote = matchQuote(quotes, pick.name, pick.market, line.oddsType);
    const last = quote?.lastLine ?? line.line;
    const open = quote?.openLine ?? null;
    const close = quote?.closeLine ?? null;
    const delta = open != null ? last - open : null;
    const steam = steamOf(open, last, line.side);
    const clv = clvPoints(line.side, line.line, close);
    rows.push({
      playerId: pick.playerId,
      name: pick.name,
      teamAbbr: pick.teamAbbr,
      opponentAbbr: pick.opponentAbbr,
      market: pick.market,
      stat: line.stat,
      line: line.line,
      side: line.side,
      oddsType: line.oddsType,
      cover,
      edge,
      juice,
      score: pick.score,
      lean: pick.lean,
      openLine: open,
      lastLine: last,
      closeLine: close,
      delta,
      steam,
      onCard: onCard.has(`${pick.playerId}|${pick.market}`),
      clv,
      gameState: pick.gameState,
    });
  }

  rows.sort((a, b) => b.edge - a.edge || b.cover - a.cover);
  const board = rows.slice(0, 36);
  const plusEv = board.filter((r) => r.edge >= 0.06).length;
  const steam = board.filter((r) => r.steam === "steam").length;
  const fade = board.filter((r) => r.steam === "fade").length;
  const clvRows = board.filter((r) => r.clv != null);
  const clvBeats = clvRows.filter((r) => (r.clv ?? 0) > 0.05).length;

  const alerts: WireBoard["alerts"] = [];
  for (const row of board) {
    if (alerts.length >= 10) break;
    const name = lastName(row.name);
    const mv = row.openLine != null && row.lastLine != null && row.openLine !== row.lastLine
      ? `${row.openLine} → ${row.lastLine}`
      : null;
    if (row.onCard && row.steam === "fade" && mv) {
      alerts.push({
        kind: "fade",
        headline: `${name} ${row.stat} steamed against the card`,
        detail: `${row.side} ${row.line} posted. Tape is ${mv}.`,
        playerId: row.playerId,
        market: row.market,
      });
      continue;
    }
    if (row.onCard && row.steam === "steam" && mv) {
      alerts.push({
        kind: "steam",
        headline: `${name} ${row.stat} moved with the card`,
        detail: `${row.side} ${row.line}. Tape ${mv}.`,
        playerId: row.playerId,
        market: row.market,
      });
      continue;
    }
    if (row.onCard && row.gameState !== "Preview" && row.clv != null && row.clv > 0.05) {
      alerts.push({
        kind: "clv",
        headline: `${name} beat the close`,
        detail: `Posted ${row.side} ${row.line}, closed ${row.closeLine}.`,
        playerId: row.playerId,
        market: row.market,
      });
      continue;
    }
    if (!row.onCard && row.edge >= 0.1 && row.steam !== "fade") {
      alerts.push({
        kind: "plus",
        headline: `${name} ${row.stat} is +EV off the card`,
        detail: `${Math.round(row.cover * 100)}% cover vs ${Math.round(row.juice * 100)}% juice · ${row.side} ${row.line}.`,
        playerId: row.playerId,
        market: row.market,
      });
    }
  }

  for (const item of news) {
    if (alerts.length >= 10) break;
    const hit = board.find((r) => namesMatch(r.name, item.name));
    alerts.unshift({
      kind: "news",
      headline: item.name ? `${lastName(item.name)} · ${item.headline}` : item.headline,
      detail: item.detail,
      playerId: hit?.playerId ?? 0,
      market: hit?.market ?? "hr",
    });
  }
  if (alerts.length > 10) alerts.length = 10;

  if (!board.length) return emptyWire();
  return {
    scanned: board.length,
    plusEv,
    steam,
    fade,
    clvBeats,
    clvN: clvRows.length,
    alerts,
    rows: board,
  };
}
