import { useMutation } from "@tanstack/react-query";
import { Loader2, Radar } from "lucide-react";
import { useEffect, useState } from "react";
import { Nameplate } from "@/components/desk/edition";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { analyzeNba } from "@/lib/nba/functions";
import { RIM, type Market } from "@/lib/nba/score";
import { BOOK } from "@/lib/slips/book";
import type { NbaBoard, NbaPlayer } from "@/lib/nba/types";

const STORAGE_KEY = "great-run:nba-board-1";

const LABEL: Record<Market, string> = {
  pts: "Points",
  reb: "Rebounds",
  ast: "Assists",
  threes: "Threes",
  pra: "Pts+Reb+Ast",
};

function loadSaved(): NbaBoard | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NbaBoard;
    if (parsed?.model?.version === RIM.version && Array.isArray(parsed.players)) return parsed;
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

function actualStat(player: NbaPlayer, market: Market): number | null {
  if (!player.actual) return null;
  return player.actual[market];
}

export function NbaDesk() {
  const [board, setBoard] = useState<NbaBoard | null>(null);
  const [booted, setBooted] = useState(false);

  const run = useMutation({
    mutationFn: () => analyzeNba(),
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
          <p className="kicker">{board ? board.date : "Tonight"}</p>
          <p className="kicker hidden sm:block">Minutes desk</p>
          <p className="kicker sm:text-right">NBA GREAT RUN</p>
        </div>
        <Nameplate sport="nba" />
        <p className="font-serif text-center text-sm leading-snug text-muted sm:text-base">
          <span className="font-display font-semibold text-fg not-italic">Minutes times a rate</span>
          <span> — six minutes off before an over, four back on before an under.</span>
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-faint tabular-nums">
            {RIM.name} {RIM.version}
            {board ? ` · ${board.games.length} games · ${board.players.length} players` : ""}
          </p>
          <Button size="lg" onClick={() => run.mutate()} disabled={run.isPending} className="w-full sm:w-auto">
            {run.isPending ? <Loader2 className="size-4 animate-spin" /> : <Radar className="size-4" />}
            {run.isPending ? "Pricing" : "Fetch & price"}
          </Button>
        </div>
      </header>

      <section className="border border-border bg-surface px-4 py-3">
        <p className="kicker">Book</p>
        <ul className="mt-2 flex flex-col gap-1">
          {BOOK.map((card) => (
            <li key={`${card.date}-${card.title}`} className="text-sm text-muted">
              <span className="text-fg">{card.date}</span>
              <span> {card.title} </span>
              <span className={card.result === "hit" ? "text-pine" : card.result === "open" ? "text-faint" : "text-brick"}>
                {card.result}
              </span>
              <span className="text-faint">
                {" "}
                · {card.legs.filter((leg) => leg.result === "hit").length}/{card.legs.filter((leg) => leg.result !== "open").length || card.legs.length}
                {card.legs
                  .filter((leg) => leg.result === "miss")
                  .map((leg) => ` · ${leg.name.split(" ").slice(-1)[0]} ${leg.actual}`)
                  .join("")}
                {card.legs.some((leg) => leg.result === "open")
                  ? ` · open ${card.legs
                      .filter((leg) => leg.result === "open")
                      .map((leg) => leg.name.split(" ").slice(-1)[0])
                      .join(", ")}`
                  : ""}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {run.isPending && !board ? (
        <div className="flex flex-col gap-4">
          <p className="kicker">Reading minutes and tonight’s slate</p>
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : null}

      {run.isError ? (
        <p className="border border-border bg-surface px-4 py-3 text-sm text-brick">The slate did not come back. Fetch again.</p>
      ) : null}

      {board && booted ? (
        <>
          <Slate games={board.games} />
          {board.slip ? <ShopCard slip={board.slip} /> : <p className="text-sm text-muted">No two-game card cleared the minute cut.</p>}
          <Tabs defaultValue="pts">
            <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0">
              {(Object.keys(LABEL) as Market[]).map((market) => (
                <TabsTrigger key={market} value={market}>
                  {LABEL[market]}
                </TabsTrigger>
              ))}
              <TabsTrigger value="formula">Formula</TabsTrigger>
            </TabsList>
            {(Object.keys(LABEL) as Market[]).map((market) => (
              <TabsContent key={market} value={market} className="mt-4">
                <PlayerList games={board.games} players={board.players} market={market} />
              </TabsContent>
            ))}
            <TabsContent value="formula" className="mt-4 flex flex-col gap-3">
              {board.notes.map((note) => (
                <p key={note} className="max-w-prose text-sm leading-relaxed text-muted">
                  {note}
                </p>
              ))}
            </TabsContent>
          </Tabs>
        </>
      ) : null}
    </main>
  );
}

function Slate({ games }: { games: NbaBoard["games"] }) {
  if (!games.length) return <p className="text-sm text-muted">No games on the board.</p>;
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {games.map((game) => (
        <li key={game.id} className="panel px-4 py-3">
          <p className="kicker">
            {game.start} · {game.state === "post" ? "Final" : game.state === "in" ? "Live" : "Scheduled"}
          </p>
          <p className="mt-1 font-medium">
            {game.awayName} at {game.homeName}
          </p>
        </li>
      ))}
    </ul>
  );
}

function ShopCard({ slip }: { slip: NonNullable<NbaBoard["slip"]> }) {
  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-border px-4 py-4 sm:px-5">
        <p className="kicker">NBA · shop card</p>
        <h2 className="font-display mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{slip.title}</h2>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">
          Minute-cut sweep {pct(slip.sweep)}. {slip.note}
        </p>
      </div>
      <ol className="flex flex-col divide-y divide-border">
        {slip.legs.map((leg, index) => (
          <li key={`${leg.name}-${leg.market}`} className="px-4 py-3 sm:px-5">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="min-w-0 font-medium">
                <span className="mr-2 tabular-nums text-faint">{index + 1}</span>
                {leg.name}
              </h3>
              <span className="shrink-0 text-sm tabular-nums text-pine">{pct(leg.cover)}</span>
            </div>
            <p className="mt-1 text-sm text-muted">
              {leg.team} · {LABEL[leg.market]} over {num1(leg.line)} · projection {num1(leg.projection)}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function PlayerList({ games, players, market }: { games: NbaBoard["games"]; players: NbaPlayer[]; market: Market }) {
  return (
    <div className="flex flex-col gap-6">
      {games.map((game) => {
        const rows = players
          .filter((player) => player.gameId === game.id)
          .sort((a, b) => b.quotes[market].projection - a.quotes[market].projection);
        return (
          <section key={game.id}>
            <p className="kicker">
              {game.start} · {game.away} at {game.home} · {rows.length} players
            </p>
            <ol className="mt-2 flex flex-col divide-y divide-border border-y border-border">
              {rows.map((player, index) => (
                <PlayerRow key={player.id} player={player} index={index} market={market} />
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

function PlayerRow({ player, index, market }: { player: NbaPlayer; index: number; market: Market }) {
  const quote = player.quotes[market];
  const actual = actualStat(player, market);
  const leanClass = quote.lean === "over" ? "text-pine" : quote.lean === "under" ? "text-brick" : "text-faint";
  return (
    <li className="px-4 py-3 sm:px-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="min-w-0 font-medium">
          <span className="mr-2 tabular-nums text-faint">{index + 1}</span>
          {player.name}
        </h3>
        <span className={`shrink-0 text-sm tabular-nums ${leanClass}`}>{quote.lean}</span>
      </div>
      <p className="mt-1 text-sm text-muted">
        {player.team} vs {player.opp} · {player.pos} · {num1(player.minutes)} min
        {player.formGp > 0 ? ` · ${player.formGp} this year` : player.gp > 0 ? ` · ${player.gp} last year` : ""}
        {player.backToBack ? " · b2b" : ""}
        {player.defense !== 1 ? ` · opp ${player.defense.toFixed(2)}` : ""}
      </p>
      <p className="mt-1 text-xs tabular-nums text-faint">
        {num1(quote.projection)} projected
        {quote.cashOver != null ? ` · over ${num1(quote.cashOver)}` : " · no over"}
        {quote.cashUnder != null ? ` · under ${num1(quote.cashUnder)}` : ""}
        {quote.cover != null ? ` · ${pct(quote.cover)} after the cut` : ""}
        {actual != null ? ` · box ${num1(actual)}` : ""}
      </p>
    </li>
  );
}
