import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { TAPE_GLOSSARY } from "@/lib/mlb/glossary";
import { formatAmerican } from "@/lib/mlb/odds";
import { emptyTape, formatCents, formatMlMove, formatTotMove, oddsMarketLabel, sparkValues, buildTape } from "@/lib/mlb/tape";
import type { BooksBoard, OddsTick, SteamFlag, TapeBoard } from "@/lib/mlb/types";

type Filter = "games" | "steam" | "props";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "games", label: "Games" },
  { id: "steam", label: "Movers" },
  { id: "props", label: "Props" },
];

function Spark({ path, field }: { path: OddsTick[]; field: "price" | "line" }) {
  const vals = sparkValues(path, field);
  if (vals.length < 2) return <span className="agate w-[4.5rem] shrink-0 text-right text-faint">—</span>;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const w = 72;
  const h = 20;
  const pad = 1.5;
  const pts = vals
    .map((v, i) => {
      const x = pad + (i / (vals.length - 1)) * (w - pad * 2);
      const y = pad + (1 - (v - min) / span) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const up = vals[vals.length - 1] > vals[0];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={`h-5 w-[4.5rem] shrink-0 ${up ? "text-brick" : "text-pine"}`} aria-hidden>
      <polyline fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round" strokeLinecap="round" points={pts} />
    </svg>
  );
}

function steamBadge(flag: SteamFlag, rlm: boolean): { label: string; variant: "pine" | "brick" | "default" } | null {
  if (rlm) return { label: "RLM", variant: "brick" };
  if (flag === "steam") return { label: "Steam", variant: "pine" };
  if (flag === "fade") return { label: "Fade", variant: "brick" };
  return null;
}

export function TapeLab({ tape, books }: { tape?: TapeBoard | null; books?: BooksBoard | null }) {
  const board = useMemo(() => {
    if (tape?.games.length) return tape;
    if (books?.games.length) return buildTape([], books, tape?.ticks ?? 0);
    return tape ?? emptyTape();
  }, [tape, books]);
  const [filter, setFilter] = useState<Filter>("games");

  const games = useMemo(() => {
    if (filter === "steam") {
      return board.games.filter((g) => g.steam !== "flat" || g.rlm || g.totalSteam !== "flat");
    }
    return board.games;
  }, [board.games, filter]);

  if (!board.games.length && !board.props.length) {
    return (
      <Card className="px-5 py-10 text-center text-sm text-muted">
        The tape is quiet. The desk snapshots consensus, DraftKings, FanDuel, Pinnacle, and player props on every tick. Open is the morning print. Close freezes at first pitch. It does not place bets.
      </Card>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div>
        <p className="kicker">The tape</p>
        <h2 className="font-display mt-1 text-4xl font-semibold tracking-tight">Odds tracker</h2>
        <p className="font-serif mt-1 max-w-2xl text-sm leading-relaxed text-muted italic">
          Moneyline, total, and player-prop Americans, snapped all day. Steam is a juiced favorite. Reverse line is the favorite getting shorter. Close is first pitch, not the box.
        </p>
      </div>

      <div className="grid grid-cols-2 overflow-hidden border border-border sm:grid-cols-4">
        <Stat kicker="Ticks" value={String(board.ticks || board.scanned)} />
        <Stat kicker="Steam" value={String(board.steam)} tone={board.steam ? "pine" : undefined} />
        <Stat kicker="Reverse" value={String(board.rlm)} tone={board.rlm ? "brick" : undefined} />
        <Stat kicker="Movers" value={String(board.movers)} />
      </div>

      {board.alerts.length ? (
        <section className="panel min-w-0 p-4">
          <p className="kicker">Moves</p>
          <ul className="mt-3 flex flex-col divide-y divide-border">
            {board.alerts.map((alert, i) => (
              <li key={`${alert.kind}-${alert.headline}-${i}`} className="py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <Badge variant={alert.kind === "rlm" || alert.kind === "prop" ? "brick" : "pine"}>{alert.kind}</Badge>
                  <p className="truncate text-sm font-medium">{alert.headline}</p>
                </div>
                <p className="mt-0.5 text-xs text-muted">{alert.detail}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:overflow-visible sm:px-0">
        {FILTERS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setFilter(s.id)}
            className={`h-11 shrink-0 px-3 text-xs font-medium tracking-wider uppercase ${
              filter === s.id ? "bg-elevated text-fg shadow-[var(--shadow-border)]" : "text-muted"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {filter === "props" ? (
        <PropList quotes={board.props} />
      ) : games.length ? (
        <ol className="enter-stagger panel min-w-0 divide-y divide-border overflow-hidden">
          {games.map((game) => {
            const flag = steamBadge(game.steam, game.rlm);
            const tot = steamBadge(game.totalSteam, false);
            return (
              <li key={`${game.awayAbbr}-${game.homeAbbr}-${game.startTime ?? ""}`} className="px-3 py-3 sm:px-4">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-medium">
                    {game.awayAbbr} @ {game.homeAbbr}
                  </p>
                  <div className="flex items-center gap-2">
                    {flag ? <Badge variant={flag.variant}>{flag.label}</Badge> : null}
                    {tot && game.totalSteam !== "flat" ? (
                      <Badge variant={tot.variant}>Tot {game.totalDelta != null && game.totalDelta > 0 ? "up" : "dn"}</Badge>
                    ) : null}
                    <Spark path={game.path} field="price" />
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Price label={game.awayAbbr} value={formatMlMove(game.openMlAway, game.lastMlAway)} />
                  <Price label={game.homeAbbr} value={formatMlMove(game.openMlHome, game.lastMlHome)} />
                  <Price label="Total" value={formatTotMove(game.openTotal, game.lastTotal)} />
                  <Price
                    label="Close"
                    value={
                      game.closeMlHome != null
                        ? `${formatAmerican(game.closeMlHome)} / ${game.closeTotal ?? "—"}`
                        : "open"
                    }
                  />
                </div>
                <p className="agate mt-2 text-faint">
                  Home {formatCents(game.mlDelta)}
                  {game.totalDelta != null && Math.abs(game.totalDelta) >= 0.45
                    ? ` · tot ${game.totalDelta > 0 ? "+" : ""}${game.totalDelta.toFixed(1)}`
                    : ""}
                  {game.books.length
                    ? ` · ${game.books
                        .slice(0, 4)
                        .map((b) => `${b.name} ${formatAmerican(b.mlHome)}`)
                        .join(" · ")}`
                    : ""}
                </p>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="py-8 text-center text-sm text-muted">Nothing on this filter.</p>
      )}

      <section className="panel p-5">
        <p className="kicker">Tape glossary</p>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {TAPE_GLOSSARY.map((term) => (
            <li key={term.key}>
              <p className="text-xs font-medium tracking-wide uppercase">{term.label}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">{term.blurb}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function PropList({ quotes }: { quotes: TapeBoard["props"] }) {
  if (!quotes.length) {
    return <p className="py-8 text-center text-sm text-muted">No player-prop juice yet. The tape needs two prints.</p>;
  }
  return (
    <ol className="enter-stagger panel min-w-0 divide-y divide-border overflow-hidden">
      {quotes.map((q) => (
        <li key={q.key} className="flex min-h-14 min-w-0 items-center gap-3 px-3 py-2.5 sm:px-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{q.name}</p>
            <p className="mt-0.5 truncate text-xs text-muted">
              {q.book} · {oddsMarketLabel(q.market.replace(/_over$/, "").replace(/_under$/, ""))} {q.lastLine ?? q.openLine ?? ""} ·{" "}
              {formatMlMove(q.openPrice, q.lastPrice)}
            </p>
          </div>
          <Spark path={q.path} field="price" />
          <p className="agate shrink-0 text-right text-faint">{formatCents(q.lastPrice != null && q.openPrice != null ? q.lastPrice - q.openPrice : null)}</p>
        </li>
      ))}
    </ol>
  );
}

function Stat({ kicker, value, tone }: { kicker: string; value: string; tone?: "pine" | "brick" }) {
  return (
    <div className="border-b border-border px-4 py-4 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <p className="kicker">{kicker}</p>
      <p className={`font-display mt-1 text-3xl leading-none font-semibold tabular-nums ${tone === "pine" ? "text-pine" : tone === "brick" ? "text-brick" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function Price({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="kicker">{label}</p>
      <p className="font-display text-lg leading-none font-semibold break-words tabular-nums sm:text-2xl">{value}</p>
    </div>
  );
}
