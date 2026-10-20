import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Nameplate } from "@/components/desk/edition";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { analyzeFront } from "@/lib/front/functions";
import type { FrontBoard } from "@/lib/front/engine.server";

const BLURB: Record<string, string> = {
  mlb: "Home runs, barrels, and the daily card.",
  nfl: "Goal-line mass. Pass, rush, and the cash number.",
  nba: "Minutes times a rate. Points, boards, assists.",
  nhl: "Shots on goal. The 1.5 is the market.",
  soccer: "Shots per start. Club form only.",
};

export function FrontDesk() {
  const [board, setBoard] = useState<FrontBoard | null>(null);
  const run = useMutation({
    mutationFn: () => analyzeFront(),
    onSuccess: setBoard,
  });

  useEffect(() => {
    run.mutate();
    // The front is a slate, not a saved card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-6 sm:px-6">
      <div className="h-0.5 w-full bg-brick" />
      <Nameplate sport="front" />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-xl">
          <h1 className="font-display text-display font-semibold tracking-tight text-fg">The night desk</h1>
          <p className="font-serif mt-3 text-base leading-snug text-muted">
            Baseball, the goal line, minutes, shots, and the match. One number. It is ours, not a book’s.
          </p>
        </div>
        <Button variant="outline" onClick={() => run.mutate()} disabled={run.isPending}>
          {run.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          {board ? board.date : "Tonight"}
        </Button>
      </div>

      {run.isPending && !board ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(board?.sports ?? [
          { id: "mlb", label: "MLB", href: "/mlb", games: [] },
          { id: "nfl", label: "NFL", href: "/nfl", games: [] },
          { id: "nba", label: "NBA", href: "/nba", games: [] },
          { id: "nhl", label: "NHL", href: "/nhl", games: [] },
          { id: "soccer", label: "Soccer", href: "/soccer", games: [] },
        ]).map((sport) => (
          <a key={sport.id} href={sport.href} className="flex flex-col gap-3 border border-border bg-surface px-4 py-4 transition-colors hover:border-fg/30">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-display text-2xl font-semibold tracking-tight text-fg">{sport.label}</p>
              <p className="kicker">{sport.games.length ? `${sport.games.length}` : "Open"}</p>
            </div>
            <p className="text-sm text-muted">{BLURB[sport.id]}</p>
            <ul className="mt-auto flex flex-col gap-1">
              {sport.games.slice(0, 4).map((game) => (
                <li key={game.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate text-fg">{game.label}</span>
                  <span className="agate shrink-0 text-faint">{game.state === "pre" ? game.start : game.state}</span>
                </li>
              ))}
              {!sport.games.length ? <li className="text-sm text-faint">No slate on this date.</li> : null}
            </ul>
          </a>
        ))}
        <a href="/finder" className="flex flex-col gap-3 border border-border bg-bg px-4 py-4 hover:border-fg/30">
          <p className="font-display text-2xl font-semibold tracking-tight text-fg">Finder</p>
          <p className="text-sm text-muted">Last season and this preseason, against our number. Star four and copy them.</p>
        </a>
      </div>
    </main>
  );
}
