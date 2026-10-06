import { useMutation } from "@tanstack/react-query";
import { Loader2, Radar } from "lucide-react";
import { useEffect, useState } from "react";
import { Nameplate } from "@/components/desk/edition";
import { SundaySlip } from "@/components/desk/sunday-slip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { analyzeNhl } from "@/lib/nhl/functions";
import { ICE } from "@/lib/nhl/score";
import type { NhlBoard, NhlSkater } from "@/lib/nhl/types";

const STORAGE_KEY = "great-run:nhl-board-2";

function loadSaved(): NhlBoard | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NhlBoard;
    if (parsed?.model?.version === ICE.version && Array.isArray(parsed.skaters)) return parsed;
  } catch {
    return null;
  }
  return null;
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function num1(n: number): string {
  return n.toFixed(1);
}

export function NhlDesk() {
  const [board, setBoard] = useState<NhlBoard | null>(null);
  const [booted, setBooted] = useState(false);

  const run = useMutation({
    mutationFn: () => analyzeNhl(),
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
    setBooted(true);
    if (!saved) run.mutate();
    // First visit posts the board. A saved card stays until Fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <p className="kicker">{board ? board.date : "Sunday"}</p>
          <p className="kicker hidden sm:block">Shot desk</p>
          <p className="kicker sm:text-right">NHL GREAT RUN</p>
        </div>
        <Nameplate sport="nhl" />
        <p className="font-serif text-center text-sm leading-snug text-muted sm:text-base">
          <span className="font-display font-semibold text-fg not-italic">Two shots, not a goal</span>
          <span> — career rate first, tonight’s box second.</span>
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-faint tabular-nums">
            ICE {ICE.version} · {ICE.shrinkGames}-game prior
            {board ? ` · ${board.games.length} games · ${board.skaters.length} skaters` : ""}
          </p>
          <Button size="lg" onClick={() => run.mutate()} disabled={run.isPending} className="w-full sm:w-auto">
            {run.isPending ? <Loader2 className="size-4 animate-spin" /> : <Radar className="size-4" />}
            {run.isPending ? "Refitting" : "Fetch & refit"}
          </Button>
        </div>
      </header>

      {run.isPending && !board ? (
        <div className="flex flex-col gap-4">
          <p className="kicker">Reading career shots and tonight’s slate</p>
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : null}

      {run.isError ? (
        <p className="border border-border bg-surface px-4 py-3 text-sm text-brick">
          The slate did not come back. Fetch again.
        </p>
      ) : null}

      {board && booted ? (
        <>
          <Slate games={board.games} />
          {board.slip ? <ShotSlip slip={board.slip} /> : (
            <p className="text-sm text-muted">No three-game shot card cleared 62%.</p>
          )}
          <SundaySlip />
          <Tabs defaultValue="shots">
            <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0">
              <TabsTrigger value="shots">Shots</TabsTrigger>
              <TabsTrigger value="points">Points</TabsTrigger>
              <TabsTrigger value="formula">Formula</TabsTrigger>
            </TabsList>
            <TabsContent value="shots" className="mt-4">
              <SkaterList games={board.games} skaters={board.skaters} mode="shots" />
            </TabsContent>
            <TabsContent value="points" className="mt-4">
              <SkaterList games={board.games} skaters={board.skaters} mode="points" />
            </TabsContent>
            <TabsContent value="formula" className="mt-4 flex flex-col gap-3">
              {board.notes.map((note) => (
                <p key={note} className="max-w-prose text-sm leading-relaxed text-muted">
                  {note}
                </p>
              ))}
              <p className="max-w-prose text-sm leading-relaxed text-muted">
                Projected shots = (season shots per game × games played + career shots per game × 12) / (games played + 12).
                Away skaters get 4% more. Home skaters get 2% less. Over 1.5 is the chance of at least two shots on that rate.
              </p>
            </TabsContent>
          </Tabs>
        </>
      ) : null}
    </main>
  );
}

function Slate({ games }: { games: NhlBoard["games"] }) {
  if (!games.length) return null;
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {games.map((game) => (
        <li key={game.id} className="panel px-4 py-3">
          <p className="kicker">{game.start}</p>
          <p className="mt-1 font-medium">
            {game.awayName} at {game.homeName}
          </p>
          <p className="mt-1 text-xs tabular-nums text-faint">
            {game.away} {game.awayMl ?? "—"} · {game.home} {game.homeMl ?? "—"}
            {game.total != null ? ` · O/U ${game.total}` : ""}
          </p>
          {game.goalies.length ? (
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Goalies {game.goalies.map((goalie) => `${goalie.name} (${goalie.team})`).join(" · ")}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function ShotSlip({ slip }: { slip: NonNullable<NhlBoard["slip"]> }) {
  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-border px-4 py-4 sm:px-5">
        <p className="kicker">NHL · {slip.market}</p>
        <h2 className="font-display mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{slip.title}</h2>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">
          Sweep chance {pct(slip.sweep)}. {slip.note}
        </p>
      </div>
      <ol className="flex flex-col divide-y divide-border">
        {slip.legs.map((leg, index) => (
          <SkaterRow key={leg.id} skater={leg} index={index} mode="shots" />
        ))}
      </ol>
    </section>
  );
}

function SkaterList({ games, skaters, mode }: { games: NhlBoard["games"]; skaters: NhlSkater[]; mode: "shots" | "points" }) {
  return (
    <div className="flex flex-col gap-6">
      {games.map((game) => {
        const rows = skaters
          .filter((skater) => skater.gameId === game.id)
          .sort((a, b) => (mode === "shots" ? b.pShots15 - a.pShots15 : b.pPoint - a.pPoint));
        return (
          <section key={game.id}>
            <p className="kicker">
              {game.start} · {game.away} at {game.home} · {rows.length} skaters
            </p>
            <ol className="mt-2 flex flex-col divide-y divide-border border-y border-border">
              {rows.map((skater, index) => (
                <SkaterRow key={skater.id} skater={skater} index={index} mode={mode} />
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

function SkaterRow({ skater, index, mode }: { skater: NhlSkater; index: number; mode: "shots" | "points" }) {
  const headline = mode === "shots" ? pct(skater.pShots15) : pct(skater.pPoint);
  return (
    <li className="px-4 py-3 sm:px-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="min-w-0 font-medium">
          <span className="mr-2 tabular-nums text-faint">{index + 1}</span>
          {skater.name}
        </h3>
        <span className="shrink-0 text-sm tabular-nums text-pine">{headline}</span>
      </div>
      <p className="mt-1 text-sm text-muted">
        {skater.team} vs {skater.opp} · {skater.start}
        {skater.pos ? ` · ${skater.pos}` : ""}
      </p>
      <p className="mt-1 text-xs tabular-nums text-faint">
        {num1(skater.lambdaSog)} shots · 2.5 shots {pct(skater.pShots25)} · point {pct(skater.pPoint)} · goal {pct(skater.pGoal)} · season weight {pct(skater.weight)}
      </p>
    </li>
  );
}
