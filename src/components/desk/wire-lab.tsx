import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { WIRE_GLOSSARY } from "@/lib/mlb/glossary";
import { headshotUrl } from "@/lib/mlb/parse";
import type { PropMarket, ScannerRow, SteamFlag, WireBoard } from "@/lib/mlb/types";
import { formatAmerican } from "@/lib/mlb/odds";
import { emptyWire, formatClv, formatCover, formatEdge, formatLineMove, marketShort } from "@/lib/mlb/wire";

type Filter = "all" | "plus" | "steam" | "card";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Board" },
  { id: "plus", label: "+EV" },
  { id: "steam", label: "Steam" },
  { id: "card", label: "On card" },
];

function steamBadge(flag: SteamFlag): { label: string; variant: "pine" | "brick" | "default" } | null {
  if (flag === "steam") return { label: "Steam", variant: "pine" };
  if (flag === "fade") return { label: "Fade", variant: "brick" };
  return null;
}

function sideLabel(row: ScannerRow): string {
  const side = row.side === "over" ? "O" : "U";
  const juice = row.oddsType !== "standard" ? ` ${row.oddsType}` : "";
  return `${side} ${row.line}${juice}`;
}

export function WireLab({
  wire,
  onOpen,
}: {
  wire?: WireBoard | null;
  onOpen: (playerId: number, market: PropMarket) => void;
}) {
  const board = wire ?? emptyWire();
  const [filter, setFilter] = useState<Filter>("all");

  const rows = useMemo(() => {
    const list =
      filter === "plus"
        ? board.rows.filter((r) => r.edge >= 0.06)
        : filter === "steam"
          ? board.rows.filter((r) => r.steam !== "flat")
          : filter === "card"
            ? board.rows.filter((r) => r.onCard)
            : board.rows;
    return list;
  }, [board.rows, filter]);

  if (!board.rows.length) {
    return (
      <Card className="px-5 py-10 text-center text-sm text-muted">
        The wire is quiet. The night desk tapes PrizePicks on each tick — open, last, close — then ranks cover minus juice. It does not place bets.
      </Card>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div>
        <p className="kicker">The wire</p>
        <h2 className="font-display mt-1 text-4xl font-semibold tracking-tight">Line tape</h2>
        <p className="font-serif mt-1 max-w-2xl text-sm leading-relaxed text-muted italic">
          Automated desks scan, they do not fire. Every live PrizePicks line is ranked by cover minus juice. Steam is a half-point vs open. CLV is the posted card vs the last quote before first pitch.
        </p>
      </div>

      <div className="grid grid-cols-2 overflow-hidden border border-border sm:grid-cols-4">
        <WireTile kicker="Scanned" value={String(board.scanned)} />
        <WireTile kicker="+EV" value={String(board.plusEv)} tone="pine" />
        <WireTile kicker="Steam / fade" value={`${board.steam} / ${board.fade}`} />
        <WireTile
          kicker="CLV"
          value={board.clvN ? `${board.clvBeats}/${board.clvN}` : "—"}
          tone={board.clvBeats > 0 ? "pine" : undefined}
        />
      </div>

      {board.alerts.length ? (
        <section className="panel min-w-0 p-4">
          <p className="kicker">Alerts</p>
          <ul className="mt-3 flex flex-col divide-y divide-border">
            {board.alerts.map((alert, i) => (
              <li key={`${alert.kind}-${alert.playerId}-${i}`}>
                <button
                  type="button"
                  onClick={() => onOpen(alert.playerId, alert.market)}
                  className="flex min-h-11 w-full min-w-0 flex-col gap-0.5 py-2.5 text-left"
                >
                  <span className="flex items-center gap-2">
                    <Badge variant={alert.kind === "fade" || alert.kind === "scratch" ? "brick" : alert.kind === "plus" || alert.kind === "news" ? "default" : "pine"}>
                      {alert.kind}
                    </Badge>
                    <span className="truncate text-sm font-medium">{alert.headline}</span>
                  </span>
                  <span className="text-xs text-muted">{alert.detail}</span>
                </button>
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

      <ol className="enter-stagger panel min-w-0 divide-y divide-border overflow-hidden">
        {rows.map((row) => {
          const flag = steamBadge(row.steam);
          return (
            <li key={`${row.playerId}-${row.market}-${row.oddsType}`}>
              <button
                type="button"
                onClick={() => onOpen(row.playerId, row.market)}
                className="flex min-h-14 w-full min-w-0 items-center gap-3 px-3 py-2.5 text-left transition-[box-shadow,transform] duration-150 ease-out hover:shadow-[var(--shadow-border)] active:scale-[0.96] sm:px-4"
              >
                <img
                  src={headshotUrl(row.playerId)}
                  alt=""
                  className="size-9 shrink-0 bg-elevated object-cover outline outline-1 -outline-offset-1 outline-fg/10"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">{row.name}</span>
                    {row.onCard ? <Badge variant="lean">Card</Badge> : null}
                    {flag ? <Badge variant={flag.variant}>{flag.label}</Badge> : null}
                    {row.edge >= 0.08 ? <Badge variant="pine">+EV</Badge> : null}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted">
                    {row.teamAbbr} vs {row.opponentAbbr} · {marketShort(row.market)} {sideLabel(row)} · tape {formatLineMove(row.openLine, row.lastLine)}
                    {row.bookLine != null
                      ? ` · ${row.bookSource ?? "Book"} ${row.bookLine} ${formatAmerican(row.bookAmerican)}`
                      : ""}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className={`font-display block text-xl leading-none font-semibold tabular-nums ${row.edge >= 0.06 ? "text-pine" : row.edge < 0 ? "text-brick" : ""}`}>
                    {formatEdge(row.edge)}
                  </span>
                  <span className="agate text-faint">{formatCover(row.cover)} cover</span>
                  {row.clv != null ? <span className="agate mt-0.5 block text-faint">{formatClv(row.clv)}</span> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {rows.length === 0 ? <p className="py-8 text-center text-sm text-muted">Nothing on this filter.</p> : null}

      <section className="panel p-5">
        <p className="kicker">Wire glossary</p>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {WIRE_GLOSSARY.map((term) => (
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

function WireTile({ kicker, value, tone }: { kicker: string; value: string; tone?: "pine" | "brick" }) {
  return (
    <div className="border-b border-border px-4 py-4 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <p className="kicker">{kicker}</p>
      <p className={`font-display mt-1 text-3xl leading-none font-semibold tabular-nums ${tone === "pine" ? "text-pine" : tone === "brick" ? "text-brick" : ""}`}>
        {value}
      </p>
    </div>
  );
}
