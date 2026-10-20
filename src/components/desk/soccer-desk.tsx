import { useMutation } from "@tanstack/react-query";
import { Loader2, Radar } from "lucide-react";
import { useEffect, useState } from "react";
import { Nameplate } from "@/components/desk/edition";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { analyzeSoccer } from "@/lib/soccer/functions";
import { PITCH } from "@/lib/soccer/score";
import type { SoccerBoard } from "@/lib/soccer/types";

const STORAGE_KEY = "great-run:soccer-board-1";

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function loadSaved(): SoccerBoard | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SoccerBoard;
    if (parsed?.model?.version === PITCH.version && Array.isArray(parsed.players)) return parsed;
  } catch {
    return null;
  }
  return null;
}

export function SoccerDesk() {
  const [board, setBoard] = useState<SoccerBoard | null>(null);
  const run = useMutation({
    mutationFn: () => analyzeSoccer(),
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
    const saved = loadSaved();
    if (saved) setBoard(saved);
    else run.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = [...(board?.players ?? [])].sort((a, b) => b.pShots15 - a.pShots15);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-4">
        <Nameplate sport="soccer" />
        <p className="font-serif text-sm leading-snug text-muted sm:text-base">
          <span className="font-display font-semibold text-fg not-italic">Shots per start</span>
          <span> — club form only. A quiet night still has to clear 1.5.</span>
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-faint tabular-nums">
            {PITCH.name} {PITCH.version}
            {board ? ` · ${board.league} · ${board.games.length} matches · ${board.players.length} players` : ""}
          </p>
          <Button size="lg" onClick={() => run.mutate()} disabled={run.isPending} className="w-full sm:w-auto">
            {run.isPending ? <Loader2 className="size-4 animate-spin" /> : <Radar className="size-4" />}
            {run.isPending ? "Reading starts" : "Fetch & price"}
          </Button>
        </div>
      </header>

      {run.isPending && !board ? (
        <div className="flex flex-col gap-4">
          <p className="kicker">Reading the match slate</p>
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : null}

      {run.isError ? (
        <p className="border border-border bg-surface px-4 py-3 text-sm text-brick">The slate did not come back. Fetch again.</p>
      ) : null}

      {board ? (
        <>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {board.games.map((game) => (
              <p key={game.id} className="border border-border bg-surface px-3 py-2 text-sm">
                <span className="text-fg">{game.away} at {game.home}</span>
                <span className="agate ml-2 text-faint">{game.state === "pre" ? game.start : game.state}</span>
              </p>
            ))}
          </div>

          {board.slip ? (
            <section className="border border-border bg-paper px-4 py-4 text-ink">
              <p className="kicker text-ink/50">{board.slip.title}</p>
              <ul className="mt-3 flex flex-col gap-2">
                {board.slip.legs.map((leg) => (
                  <li key={leg.name} className="flex items-baseline justify-between gap-3 text-sm">
                    <span>{leg.name}, {leg.team}</span>
                    <span className="tabular-nums">over {leg.line} shots · {leg.projection.toFixed(1)} · {pct(leg.cover)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm text-ink/60">{board.slip.note}</p>
            </section>
          ) : (
            <p className="text-sm text-muted">No three-match shot card cleared a quiet night.</p>
          )}

          <div className="overflow-x-auto border border-border bg-surface">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="text-xs uppercase tracking-widest text-stone">
                <tr>
                  {["Player", "Shots", "1.5", "SOT", "Goal", "Starts"].map((label) => (
                    <th key={label} className="px-3 py-2 font-medium">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 40).map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <p className="font-medium text-fg">{row.name}</p>
                      <p className="text-xs text-faint">{row.team} {row.pos} at {row.opp} · {row.start}{row.cashShots ? " · cash 1.5" : ""}</p>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{row.shots.toFixed(1)}</td>
                    <td className="px-3 py-2 tabular-nums">{pct(row.pShots15)}</td>
                    <td className="px-3 py-2 tabular-nums">{row.sot.toFixed(1)} · {pct(row.pSot05)}</td>
                    <td className="px-3 py-2 tabular-nums">{pct(row.pGoal)}</td>
                    <td className="px-3 py-2 tabular-nums">{row.starts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {board.notes.map((note) => (
            <p key={note} className="text-sm leading-relaxed text-muted">{note}</p>
          ))}
        </>
      ) : null}
    </main>
  );
}
