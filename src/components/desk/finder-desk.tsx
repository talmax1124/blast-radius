import { useMutation } from "@tanstack/react-query";
import { Loader2, Radar, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Nameplate } from "@/components/desk/edition";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { analyzeFinder } from "@/lib/finder/functions";
import type { FinderBoard, FinderRow } from "@/lib/finder/types";

const STORAGE_KEY = "great-run:finder-1";
const PICKS_KEY = "great-run:finder-picks";

function pct(n: number | null): string {
  if (n == null) return "—";
  return `${Math.round(n * 100)}%`;
}

function num1(n: number | null): string {
  if (n == null) return "—";
  return n.toFixed(1);
}

function loadBoard(): FinderBoard | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FinderBoard;
    if (Array.isArray(parsed?.rows)) return parsed;
  } catch {
    return null;
  }
  return null;
}

export function FinderDesk() {
  const [board, setBoard] = useState<FinderBoard | null>(null);
  const [sport, setSport] = useState<"ALL" | "NBA" | "NHL">("ALL");
  const [market, setMarket] = useState("ALL");
  const [floor, setFloor] = useState(0.6);
  const [picks, setPicks] = useState<string[]>([]);

  const run = useMutation({
    mutationFn: () => analyzeFinder(),
    onSuccess: (next) => {
      setBoard(next);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    },
  });

  useEffect(() => {
    const saved = loadBoard();
    if (saved) setBoard(saved);
    else run.mutate();
    try {
      const raw = localStorage.getItem(PICKS_KEY);
      if (raw) setPicks(JSON.parse(raw) as string[]);
    } catch {
      /* ignore */
    }
    // First visit builds the board. A saved card stays until Fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(PICKS_KEY, JSON.stringify(picks));
    } catch {
      /* ignore */
    }
  }, [picks]);

  const markets = useMemo(() => {
    const rows = board?.rows.filter((row) => sport === "ALL" || row.sport === sport) ?? [];
    return ["ALL", ...new Set(rows.map((row) => row.market))];
  }, [board, sport]);

  const rows = useMemo(() => {
    return (board?.rows ?? [])
      .filter((row) => sport === "ALL" || row.sport === sport)
      .filter((row) => market === "ALL" || row.market === market)
      .filter((row) => (row.l10 ?? 0) >= floor)
      .sort((a, b) => (b.l10 ?? -1) - (a.l10 ?? -1) || (b.diff ?? -99) - (a.diff ?? -99));
  }, [board, sport, market, floor]);

  const picked = (board?.rows ?? []).filter((row) => picks.includes(row.id));

  function toggle(id: string) {
    setPicks((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id);
      if (prev.length >= 4) return prev;
      return [...prev, id];
    });
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 pb-28 sm:px-6">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <p className="kicker">{board ? board.date : "Tonight"}</p>
          <p className="kicker hidden sm:block">Hit rate desk</p>
          <p className="kicker sm:text-right">FINDER</p>
        </div>
        <Nameplate sport="finder" />
        <p className="font-serif text-center text-sm leading-snug text-muted sm:text-base">
          <span className="font-display font-semibold text-fg not-italic">Last year, then this preseason</span>
          <span> — hit rate against our number, not a book line.</span>
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-faint tabular-nums">
            {board ? `${rows.length} showing · ${board.rows.length} priced` : "Last 5, last 10, season, preseason"}
          </p>
          <Button size="lg" onClick={() => run.mutate()} disabled={run.isPending} className="w-full sm:w-auto">
            {run.isPending ? <Loader2 className="size-4 animate-spin" /> : <Radar className="size-4" />}
            {run.isPending ? "Reading logs" : "Fetch logs"}
          </Button>
        </div>
      </header>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {(["ALL", "NBA", "NHL"] as const).map((item) => (
            <Button key={item} size="sm" variant={sport === item ? "default" : "outline"} onClick={() => { setSport(item); setMarket("ALL"); }}>
              {item}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {markets.map((item) => (
            <Button key={item} size="sm" variant={market === item ? "default" : "outline"} onClick={() => setMarket(item)}>
              {item}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            [0, "Any L10"],
            [0.5, "L10 50%"],
            [0.6, "L10 60%"],
            [0.7, "L10 70%"],
          ].map(([value, label]) => (
            <Button key={label} size="sm" variant={floor === value ? "default" : "outline"} onClick={() => setFloor(Number(value))}>
              {label}
            </Button>
          ))}
        </div>
      </div>

      {run.isPending && !board ? (
        <div className="flex flex-col gap-4">
          <p className="kicker">Reading last season and this preseason</p>
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : null}

      {run.isError ? (
        <p className="border border-border bg-surface px-4 py-3 text-sm text-brick">The logs did not come back. Fetch again.</p>
      ) : null}

      {board ? (
        <div className="overflow-x-auto border border-border bg-surface">
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead className="text-xs uppercase tracking-widest text-stone">
              <tr>
                {["", "Player", "Line", "Proj", "Avg", "Diff", "L5", "L10", "SZN", "PRE", "Strk"].map((label) => (
                  <th key={label} className="px-3 py-2 font-medium">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 80).map((row) => (
                <FinderLine key={row.id} row={row} on={picks.includes(row.id)} onToggle={() => toggle(row.id)} />
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? <p className="px-4 py-6 text-sm text-muted">Nothing clears that filter.</p> : null}
        </div>
      ) : null}

      {board?.notes.map((note) => (
        <p key={note} className="text-sm leading-relaxed text-muted">{note}</p>
      ))}

      <aside className="fixed inset-x-0 bottom-0 border-t border-border bg-bg/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-fg">
            {picked.length ? picked.map((row) => `${row.name} ${row.market} over ${row.line}`).join(" · ") : "Star up to four. That is the slip."}
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={!picked.length}
            onClick={() => {
              const text = picked.map((row) => `${row.name} over ${row.line} ${row.market}`).join(", ");
              void navigator.clipboard?.writeText(`${text}. One parlay.`);
            }}
          >
            Copy for Gambly
          </Button>
        </div>
      </aside>
    </main>
  );
}

function FinderLine({ row, on, onToggle }: { row: FinderRow; on: boolean; onToggle: () => void }) {
  return (
    <tr className="border-t border-border">
      <td className="px-3 py-2">
        <button type="button" aria-label={`Star ${row.name}`} onClick={onToggle} className="grid size-11 place-items-center">
          <Star className={on ? "size-4 fill-pine text-pine" : "size-4 text-faint"} />
        </button>
      </td>
      <td className="px-3 py-2">
        <p className="font-medium text-fg">{row.name}</p>
        <p className="text-xs text-faint">
          {row.sport} {row.team} {row.pos} · {row.game} {row.start}
          {row.source === "preseason" ? " · L10 is preseason" : ""}
        </p>
      </td>
      <td className="px-3 py-2 tabular-nums">{row.market} {row.line}</td>
      <td className="px-3 py-2 tabular-nums">{num1(row.projection)}</td>
      <td className="px-3 py-2 tabular-nums">{num1(row.avg)}</td>
      <td className={`px-3 py-2 tabular-nums ${row.diff != null && row.diff > 0 ? "text-pine" : "text-muted"}`}>{num1(row.diff)}</td>
      <td className="px-3 py-2 tabular-nums">{pct(row.l5)}</td>
      <td className="px-3 py-2 tabular-nums">{pct(row.l10)}{row.n10 < 10 ? ` (${row.n10})` : ""}</td>
      <td className="px-3 py-2 tabular-nums">{pct(row.season)}</td>
      <td className="px-3 py-2 tabular-nums">{pct(row.pre)}</td>
      <td className="px-3 py-2 tabular-nums">{row.streak > 0 ? `+${row.streak}` : row.streak}</td>
    </tr>
  );
}
