import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { BOOKS_GLOSSARY } from "@/lib/mlb/glossary";
import { formatAmerican, formatHold, formatImplied, leakOf, emptyBooks } from "@/lib/mlb/odds";
import { marketShort } from "@/lib/mlb/wire";
import type { BookGame, BooksBoard, PropMarket, ScannerRow, WireBoard } from "@/lib/mlb/types";

type Filter = "games" | "shop" | "leak";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "games", label: "Games" },
  { id: "shop", label: "Shop" },
  { id: "leak", label: "Leak" },
];

function totalSteam(game: BookGame): number | null {
  if (game.open?.total == null || game.consensus.total == null) return null;
  const d = game.consensus.total - game.open.total;
  return Math.abs(d) >= 0.45 ? d : null;
}

function shopRows(wire?: WireBoard | null): ScannerRow[] {
  return (wire?.rows ?? []).filter((r) => r.bookLine != null);
}

export function BooksLab({
  books,
  wire,
  onOpen,
}: {
  books?: BooksBoard | null;
  wire?: WireBoard | null;
  onOpen: (playerId: number, market: PropMarket) => void;
}) {
  const board = books ?? emptyBooks();
  const [filter, setFilter] = useState<Filter>("games");
  const shop = useMemo(() => shopRows(wire), [wire]);
  const leaks = useMemo(() => shop.filter(leakOf), [shop]);

  if (!board.games.length && !board.props.length) {
    return (
      <Card className="px-5 py-10 text-center text-sm text-muted">
        Books are quiet. The desk pulls Action Network consensus and Bovada player props without a paid key. It does not place bets.
      </Card>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div>
        <p className="kicker">The books</p>
        <h2 className="font-display mt-1 text-4xl font-semibold tracking-tight">Odds page</h2>
        <p className="font-serif mt-1 max-w-2xl text-sm leading-relaxed text-muted italic">
          Consensus moneyline and total from the public Action Network board. Player props from Bovada, shopped against PrizePicks. A softer pick'em number is leak — not a wager.
        </p>
      </div>

      <div className="grid grid-cols-2 overflow-hidden border border-border sm:grid-cols-4">
        <Stat kicker="Games" value={String(board.games.length)} />
        <Stat kicker="Books" value={String(board.books || "—")} />
        <Stat kicker="Props" value={String(board.props.length)} />
        <Stat kicker="Leaks" value={String(leaks.length)} tone={leaks.length ? "brick" : undefined} />
      </div>

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

      {filter === "games" ? (
        <ol className="enter-stagger panel min-w-0 divide-y divide-border overflow-hidden">
          {board.games.map((game) => {
            const steam = totalSteam(game);
            const favHome = (game.consensus.mlHome ?? 0) < (game.consensus.mlAway ?? 0);
            return (
              <li key={`${game.awayAbbr}-${game.homeAbbr}-${game.startTime ?? ""}`} className="px-3 py-3 sm:px-4">
                <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-medium">
                    {game.awayAbbr} @ {game.homeAbbr}
                  </p>
                  <p className="agate text-muted">
                    tot {game.consensus.total ?? "—"} · hold {formatHold(game.hold)}
                    {steam != null ? ` · ${steam > 0 ? "+" : ""}${steam.toFixed(1)} vs open` : ""}
                  </p>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Price label={game.awayAbbr} value={formatAmerican(game.consensus.mlAway)} dim={favHome} />
                  <Price label={game.homeAbbr} value={formatAmerican(game.consensus.mlHome)} dim={!favHome} />
                  <Price label="Over" value={formatAmerican(game.consensus.over)} />
                  <Price label="Under" value={formatAmerican(game.consensus.under)} />
                </div>
                {game.books.length ? (
                  <p className="agate mt-2 text-faint">
                    {game.books
                      .map((b) => `${b.name} ${formatAmerican(b.line.mlHome)} / ${b.line.total ?? "—"}`)
                      .join(" · ")}
                  </p>
                ) : null}
                {steam != null ? (
                  <Badge variant={steam > 0 ? "brick" : "pine"} className="mt-2">
                    Total {steam > 0 ? "up" : "down"}
                  </Badge>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <ShopList
          rows={filter === "leak" ? leaks : shop}
          empty={filter === "leak" ? "No leaks versus the book." : "No overlapping Bovada numbers yet."}
          onOpen={onOpen}
        />
      )}

      <section className="panel p-5">
        <p className="kicker">Books glossary</p>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {BOOKS_GLOSSARY.map((term) => (
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

function ShopList({
  rows,
  empty,
  onOpen,
}: {
  rows: ScannerRow[];
  empty: string;
  onOpen: (playerId: number, market: PropMarket) => void;
}) {
  if (!rows.length) {
    return <p className="py-8 text-center text-sm text-muted">{empty}</p>;
  }
  return (
    <ol className="enter-stagger panel min-w-0 divide-y divide-border overflow-hidden">
      {rows.map((row) => (
        <li key={`${row.playerId}-${row.market}-${row.oddsType}`}>
          <button
            type="button"
            onClick={() => onOpen(row.playerId, row.market)}
            className="flex min-h-14 w-full min-w-0 items-center gap-3 px-3 py-2.5 text-left transition-[box-shadow,transform] duration-150 ease-out hover:shadow-[var(--shadow-border)] active:scale-[0.96] sm:px-4"
          >
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="truncate text-sm font-medium">{row.name}</span>
                {row.onCard ? <Badge variant="lean">Card</Badge> : null}
                {leakOf(row) ? <Badge variant="brick">Leak</Badge> : null}
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted">
                {marketShort(row.market)} PrizePicks {row.side} {row.line} · {row.bookSource ?? "Book"} {row.bookLine} {formatAmerican(row.bookAmerican)}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="font-display block text-xl leading-none font-semibold tabular-nums">
                {formatImplied(row.bookImplied)}
              </span>
              <span className="agate text-faint">{Math.round(row.cover * 100)}% cover</span>
            </span>
          </button>
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

function Price({ label, value, dim }: { label: string; value: string; dim?: boolean }) {
  return (
    <div className={dim ? "opacity-50" : ""}>
      <p className="kicker">{label}</p>
      <p className="font-display text-2xl leading-none font-semibold tabular-nums">{value}</p>
    </div>
  );
}
