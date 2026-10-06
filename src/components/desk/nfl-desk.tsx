import { useMutation } from "@tanstack/react-query";
import { Loader2, Radar } from "lucide-react";
import { useEffect, useState } from "react";
import { Nameplate } from "@/components/desk/edition";
import { SundaySlip } from "@/components/desk/sunday-slip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { analyzeNfl } from "@/lib/nfl/functions";
import { mondayReport } from "@/lib/nfl/monday";
import { RZM } from "@/lib/nfl/score";
import { marketLabel } from "@/lib/nfl/slips";
import type { ListedProp, MatchSheet, NflBoard, NflMarket, NflPick, NflSlip, SheetPlayer } from "@/lib/nfl/types";

const STORAGE_KEY = "great-run:nfl-board-1";

const LOADING = [
  "Pulling the NFL week",
  "Reading the first two weeks of usage",
  "Shrinking touchdown rates toward the league",
  "Splitting finish and explosive mass",
  "Pricing the spread that is still up",
  "Grading live boxes",
];

function loadSaved(): NflBoard | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NflBoard;
    if (parsed?.model?.version === RZM.version && parsed.goalLine?.length) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function num1(n: number): string {
  return n.toFixed(1);
}

function tdCount(pick: NflPick): number {
  if (!pick.actual) return 0;
  return pick.actual.rushTd + pick.actual.recTd;
}

function headshot(id: number | null): string | null {
  return id ? `https://a.espncdn.com/i/headshots/nfl/players/full/${id}.png` : null;
}

function logo(abbr: string): string {
  return `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr.toLowerCase()}.png`;
}

export function NflDesk() {
  const [board, setBoard] = useState<NflBoard | null>(null);
  const [stage, setStage] = useState(0);
  const [selected, setSelected] = useState<NflPick | null>(null);
  const [market, setMarket] = useState<NflMarket | "all">("all");
  const [booted, setBooted] = useState(false);

  const run = useMutation({
    mutationFn: () => analyzeNfl(),
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

  useEffect(() => {
    if (!run.isPending) return;
    const id = window.setInterval(() => setStage((n) => (n + 1) % LOADING.length), 2200);
    return () => window.clearInterval(id);
  }, [run.isPending]);

  const featured = board?.goalLine[0];

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <p className="kicker">{board ? `Week ${board.week}` : "Week"}</p>
          <p className="kicker hidden sm:block">Goal line desk</p>
          <p className="kicker sm:text-right">NFL GREAT RUN</p>
        </div>
        <Nameplate sport="nfl" />
        <p className="font-serif text-center text-sm leading-snug text-muted sm:text-base">
          <span className="font-display font-semibold text-fg not-italic">Two ways to score</span>
          <span> — finish work inside the 20, and the chunk play that starts outside it.</span>
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-faint tabular-nums">
            {board ? `${board.games.length} games · Week ${board.week}` : "Eastern slate"} · Red-Zone Mass {RZM.version}
          </p>
          <Button size="lg" onClick={() => run.mutate()} disabled={run.isPending} className="w-full sm:w-auto">
            {run.isPending ? <Loader2 className="size-4 animate-spin" /> : <Radar className="size-4" />}
            {run.isPending ? "Posting" : "Fetch & analyze"}
          </Button>
        </div>
      </header>

      <SundaySlip />

      <MondayCard />

      {run.isPending && !board ? (
        <div className="flex flex-col gap-4">
          <p className="kicker">{LOADING[stage]}</p>
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
          {board.match ? <MatchCard sheet={board.match} /> : null}
          <Slate games={board.games} />
          <p className="max-w-prose text-sm leading-relaxed text-muted">{board.notes[0]}</p>
          <Tabs defaultValue="goal">
            <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0">
              <TabsTrigger value="goal">Goal Line</TabsTrigger>
              <TabsTrigger value="props">Props</TabsTrigger>
              <TabsTrigger value="slips">Slips</TabsTrigger>
              <TabsTrigger value="formula">Formula</TabsTrigger>
            </TabsList>
            <TabsContent value="goal" className="mt-4 flex flex-col gap-4">
              {featured ? <Featured pick={featured} onOpen={() => setSelected(featured)} /> : null}
              <ol className="flex flex-col divide-y divide-border border-y border-border">
                {board.goalLine.map((pick) => (
                  <li key={pick.id}>
                    <PickRow pick={pick} onOpen={() => setSelected(pick)} />
                  </li>
                ))}
              </ol>
            </TabsContent>
            <TabsContent value="props" className="mt-4 flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["all", "All"],
                    ["pass", "Pass"],
                    ["rush", "Rush"],
                    ["recyd", "Rec yds"],
                    ["rec", "Catches"],
                    ["atd", "TD"],
                  ] as const
                ).map(([id, label]) => (
                  <Button key={id} size="sm" variant={market === id ? "default" : "outline"} onClick={() => setMarket(id)}>
                    {label}
                  </Button>
                ))}
              </div>
              <ol className="flex flex-col divide-y divide-border border-y border-border">
                {board.props
                  .filter((p) => market === "all" || p.quotes.some((q) => q.market === market) || (market === "atd" && p.lambda >= 0.12))
                  .slice(0, 24)
                  .map((pick) => (
                    <li key={pick.id}>
                      <PropRow pick={pick} market={market} onOpen={() => setSelected(pick)} />
                    </li>
                  ))}
              </ol>
            </TabsContent>
            <TabsContent value="slips" className="mt-4 grid gap-3 lg:grid-cols-3">
              {board.slips.map((slip) => (
                <SlipCard key={slip.size} slip={slip} />
              ))}
            </TabsContent>
            <TabsContent value="formula" className="mt-4">
              <Formula board={board} />
            </TabsContent>
          </Tabs>
          <ul className="flex flex-col gap-1 text-xs leading-relaxed text-faint">
            {board.notes.slice(1).map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </>
      ) : null}

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent>
          {selected ? <PlayerSheet pick={selected} /> : null}
        </SheetContent>
      </Sheet>
    </main>
  );
}

function MondayCard() {
  const card = mondayReport();
  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-border px-4 py-4 sm:px-5">
        <p className="kicker">Monday perfect 4</p>
        <h2 className="font-display mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Eagles at Bears</h2>
        <p className="mt-1 text-sm text-muted">
          {card.detail} · {card.spread} · total {card.total}
        </p>
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted">{card.script}</p>
        <p className="mt-3 text-xs tabular-nums text-faint">
          {card.sims.toLocaleString()} correlated games · sweep {pct(card.sweep)} · if it blows out {pct(card.sweepIfBlowout)} · if it’s one score{" "}
          {pct(card.sweepIfClose)} · blowout itself {pct(card.blowout)}
        </p>
      </div>
      <ol className="flex flex-col divide-y divide-border">
        {card.legs.map((leg, index) => (
          <li key={leg.id} className="px-4 py-3 sm:px-5">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="min-w-0 font-medium">
                <span className="mr-2 tabular-nums text-faint">{index + 1}</span>
                {leg.player}
              </h3>
              <span className="shrink-0 text-sm tabular-nums text-pine">{pct(leg.p)}</span>
            </div>
            <p className="mt-1 text-xs text-faint">
              {leg.team} · {leg.pos} · {leg.label} over {leg.line}
              <span className="text-muted"> · sim {num1(leg.mean)}</span>
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted">{leg.why}</p>
          </li>
        ))}
      </ol>
      <div className="border-t border-border px-4 py-3 sm:px-5">
        <p className="kicker">Left off</p>
        <ul className="mt-2 flex flex-col gap-2 text-xs leading-relaxed text-faint">
          {card.traps.map((trap) => (
            <li key={trap}>{trap}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-faint">
          Standard numbers only. A demon raises the multiplier and is how a perfect card dies. The Purple token pays the fee back in credits only if the
          entry goes 4/4 and does not also earn Extra Winnings. One miss and the token pays nothing. Opt in before 11:00 PM ET. Pick6 lines can sit a half
          yard off these.
        </p>
      </div>
    </section>
  );
}

function MatchCard({ sheet }: { sheet: MatchSheet }) {
  const sides = [sheet.away, sheet.home];
  const leans = sheet.players.flatMap((player) =>
    player.props
      .filter((prop) => prop.lean !== "no play")
      .map((prop) => ({ prop, player })),
  );
  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-border px-4 py-4 sm:px-5">
        <p className="kicker">Sunday night props</p>
        <h2 className="font-display mt-1 text-3xl font-semibold tracking-tight">
          {sheet.away} at {sheet.home}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {sheet.detail}
          {sheet.spread ? ` · ${sheet.spread}` : ""}
          {sheet.total ? ` · total ${sheet.total}` : ""}
        </p>
        {sheet.weather ? <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">{sheet.weather}</p> : null}
        <p className="mt-2 max-w-prose text-xs leading-relaxed text-faint">{sheet.note}</p>
        {leans.length ? (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {leans.map(({ prop, player }) => (
              <li key={`${player.id}-${prop.market}`} className="flex items-baseline justify-between gap-3 border-t border-border pt-2 text-sm">
                <span className="min-w-0 truncate">
                  {player.name.split(" ").slice(-1)} {marketLabel(prop.market)} {prop.line}
                </span>
                <span className="shrink-0 tabular-nums">
                  <Lean prop={prop} />
                  <span className="text-faint"> {prop.market === "atd" ? pct(prop.projection) : num1(prop.projection)} · {pct(prop.cover ?? 0)}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="grid lg:grid-cols-2">
        {sides.map((team) => {
          const side = sheet.players.filter((p) => p.team === team);
          return (
            <div key={team} className="border-b border-border px-4 py-4 last:border-b-0 lg:border-r lg:border-b-0 lg:last:border-r-0">
              <div className="flex items-center gap-2">
                <img src={logo(team)} alt="" className="size-5 object-contain" />
                <p className="kicker">{team}</p>
                <p className="text-xs text-faint tabular-nums">{side.length}</p>
              </div>
              <ul className="mt-3 flex flex-col gap-5">
                {side.map((player) => (
                  <li key={player.id}>
                    <SheetRow player={player} />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SheetRow({ player }: { player: SheetPlayer }) {
  const shot = headshot(player.espnId);
  return (
    <article>
      <div className="flex items-start gap-3">
        {shot ? <img src={shot} alt="" className="size-10 rounded-sm object-cover" /> : <span className="size-10 shrink-0 bg-elevated" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="truncate font-medium">{player.name}</h3>
            <span className="shrink-0 font-display text-xl font-semibold tabular-nums">{pct(player.pTd)}</span>
          </div>
          <p className="text-xs text-faint">
            {player.pos}
            {player.status !== "Active" ? ` · ${player.status}` : ""} · {player.team}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted">{player.form}</p>
        </div>
      </div>
      {player.reasons.length ? (
        <p className="mt-2 text-xs leading-relaxed text-pine">{player.reasons[0]}</p>
      ) : null}
      <ul className="mt-2 flex flex-col gap-1">
        {player.props.map((prop) => (
          <li key={prop.market} className="grid grid-cols-[4.75rem_minmax(0,1fr)_3.25rem] items-baseline gap-2 text-xs tabular-nums">
            <span className="text-muted">{marketLabel(prop.market)}</span>
            <span className="truncate">
              {prop.market === "atd" ? pct(prop.projection) : num1(prop.projection)}
              {prop.line != null ? ` vs ${prop.line}` : " · no line"}
              {prop.cover != null ? ` · ${pct(prop.cover)}` : ""}
            </span>
            <Lean prop={prop} />
          </li>
        ))}
      </ul>
    </article>
  );
}

function Lean({ prop }: { prop: ListedProp }) {
  if (prop.lean === "over") return <span className="text-right text-pine">Over</span>;
  if (prop.lean === "under") return <span className="text-right text-brick">Under</span>;
  if (prop.line != null && prop.cover != null && (prop.cover >= 0.57 || prop.cover <= 0.43)) {
    return <span className="text-right text-stone">Watch</span>;
  }
  return <span className="text-right text-faint">Pass</span>;
}

function Slate({ games }: { games: NflBoard["games"] }) {
  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <p className="kicker">The slate</p>
        <p className="text-xs text-faint tabular-nums">{games.length} games</p>
      </div>
      <div className="flex gap-px overflow-x-auto bg-border">
        {games.map((game) => (
          <article key={game.id} className="min-w-44 shrink-0 bg-surface px-3 py-3">
            <p className="text-xs tracking-widest text-faint uppercase">{game.detail}</p>
            <div className="mt-2 flex items-center gap-1.5">
              <img src={logo(game.away)} alt="" className="size-5 object-contain" />
              <span className="text-sm font-medium">{game.away}</span>
              {game.awayScore != null ? <span className="text-sm tabular-nums text-muted">{game.awayScore}</span> : null}
              <span className="text-faint">@</span>
              <img src={logo(game.home)} alt="" className="size-5 object-contain" />
              <span className="text-sm font-medium">{game.home}</span>
              {game.homeScore != null ? <span className="text-sm tabular-nums text-muted">{game.homeScore}</span> : null}
            </div>
            <p className="mt-1 truncate text-xs text-muted">
              {game.spreadLabel ?? "No spread"}
              {game.total ? ` · ${game.total}` : ""}
              {game.neutral ? " · Neutral" : ""}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}

function Featured({ pick, onOpen }: { pick: NflPick; onOpen: () => void }) {
  const finish = pick.lambda > 0 ? pick.lambdaFinish / pick.lambda : 0;
  return (
    <button type="button" onClick={onOpen} className="panel w-full px-4 py-4 text-left sm:px-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="kicker">Goal Line 1</p>
          <h2 className="font-display mt-1 text-3xl font-semibold tracking-tight">{pick.name}</h2>
          <p className="mt-1 text-sm text-muted">
            {pick.pos} · {pick.team} vs {pick.opp}
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-4xl font-semibold tabular-nums">{pct(pick.pTd)}</p>
          <p className="text-xs text-faint">anytime</p>
        </div>
      </div>
      <div className="mt-4 flex h-2 overflow-hidden bg-elevated">
        <div className="bg-pine" style={{ width: `${Math.round(finish * 100)}%` }} />
        <div className="bg-stone" style={{ width: `${Math.round((1 - finish) * 100)}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted">
        Finish {num1(pick.lambdaFinish)} · Explosive {num1(pick.lambdaExplosive)} · λ {num1(pick.lambda)}
      </p>
    </button>
  );
}

function PickRow({ pick, onOpen }: { pick: NflPick; onOpen: () => void }) {
  const td = tdCount(pick);
  const shot = headshot(pick.espnId);
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 px-1 py-3 text-left hover:bg-surface">
      <span className="w-6 text-sm tabular-nums text-faint">{pick.rank}</span>
      {shot ? <img src={shot} alt="" className="size-10 rounded-sm object-cover" /> : <span className="size-10 bg-elevated" />}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{pick.name}</span>
        <span className="block truncate text-xs text-muted">
          {pick.pos} · {pick.team} vs {pick.opp}
          {pick.fromBook ? "" : " · no number"}
        </span>
      </span>
      {td > 0 ? <Badge variant="pine">{td} TD</Badge> : null}
      {pick.gameState === "in" && td === 0 ? <Badge>Live</Badge> : null}
      <span className="w-14 text-right font-display text-2xl font-semibold tabular-nums">{pct(pick.pTd)}</span>
    </button>
  );
}

function PropRow({
  pick,
  market,
  onOpen,
}: {
  pick: NflPick;
  market: NflMarket | "all";
  onOpen: () => void;
}) {
  const quote = pick.quotes.find((q) => market === "all" || q.market === market) ?? pick.quotes[0];
  const showTd = market === "atd" || (!quote && market === "all");
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 px-1 py-3 text-left hover:bg-surface">
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{pick.name}</span>
        <span className="block truncate text-xs text-muted">
          {pick.pos} · {pick.team} vs {pick.opp}
        </span>
      </span>
      {quote && !showTd ? (
        <span className="text-right text-sm tabular-nums">
          <span className="block text-fg">
            {marketLabel(quote.market)} {quote.line}
          </span>
          <span className="text-xs text-muted">
            {num1(quote.projection)} proj · {pct(quote.cover)}
          </span>
        </span>
      ) : (
        <span className="text-right text-sm tabular-nums text-muted">
          <span className="block text-fg">{pct(pick.pTd)} TD</span>
          <span className="text-xs">
            {pick.pos === "QB" ? `${num1(pick.expPassYd)} pass` : `${num1(pick.expRushYd)} rush · ${num1(pick.expRecYd)} rec`}
          </span>
        </span>
      )}
    </button>
  );
}

function SlipCard({ slip }: { slip: NflSlip }) {
  const hits = slip.legs.filter((l) => l.result === "hit").length;
  const misses = slip.legs.filter((l) => l.result === "miss").length;
  return (
    <article className="panel flex flex-col gap-3 px-4 py-4">
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-2xl font-semibold">{slip.title}</h3>
        {slip.skip ? <Badge>Skip</Badge> : <Badge variant="pine">{hits}-{misses}</Badge>}
      </div>
      <p className="text-sm leading-relaxed text-muted">{slip.notes}</p>
      {slip.legs.length ? (
        <ul className="flex flex-col gap-2 border-t border-border pt-3">
          {slip.legs.map((leg) => (
            <li key={`${leg.playerId}-${leg.market}`} className="flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">
                {leg.name.split(" ").slice(-1)} {marketLabel(leg.market)} {leg.line}
              </span>
              <span className="shrink-0 tabular-nums text-muted">
                {pct(leg.cover)}
                {leg.result === "hit" ? " · hit" : leg.result === "miss" ? " · miss" : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

function Formula({ board }: { board: NflBoard }) {
  const pick = board.goalLine[0];
  return (
    <article className="grid gap-4 border border-border bg-paper px-5 py-6 text-ink lg:grid-cols-[minmax(0,1.2fr)_minmax(16rem,0.8fr)]">
      <div>
        <p className="kicker text-ink/45">Red-Zone Mass {RZM.version}</p>
        <h2 className="font-display mt-2 text-3xl font-semibold tracking-tight">Not one rate</h2>
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-ink/80">
          A touchdown is either a finish or an explosion. Finish is the short chance: goal line, red zone, the back who gets
          the ball inside the 5. Explosive is the chunk play that starts outside the 20. The desk does not pretend two weeks
          of touchdowns are talent. Team rates shrink toward the league with six pseudo-games. Player share is a Dirichlet mix
          of real touches and a rank prior. The channel tilt stays inside that share, so a short list cannot eat the whole
          team’s touchdowns.
        </p>
        <p className="mt-4 font-mono text-xs leading-relaxed text-ink/70">
          λ = 0.74 × (λ_finish + λ_explosive)
          <br />
          λ_finish = E[team TDs] × share × finish tilt
          <br />
          E[team TDs] = shrunk rate × opp permeability × (1 + script) × (implied / 22.5)^p
          <br />
          P(anytime) = 1 − exp(−λ)
        </p>
        <p className="mt-4 max-w-prose text-sm leading-relaxed text-ink/70">
          Yards are lognormal: expected attempts times a shrunk yards-per-play, times how many yards the opponent has allowed,
          capped so a two-game fluke cannot double the number. Receptions are Poisson. Power pays 3× and 6×. Flex on six pays
          25× / 2× / 0.4×. A skip is an empty card, not a loss.
        </p>
      </div>
      {pick ? (
        <aside className="border-t border-ink/10 pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-5">
          <p className="kicker text-ink/45">Plugged in</p>
          <p className="font-display mt-2 text-2xl font-semibold">{pick.name}</p>
          <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-ink/55">Anytime</dt>
            <dd className="text-right tabular-nums">{pct(pick.pTd)}</dd>
            <dt className="text-ink/55">λ finish</dt>
            <dd className="text-right tabular-nums">{num1(pick.lambdaFinish)}</dd>
            <dt className="text-ink/55">λ explosive</dt>
            <dd className="text-right tabular-nums">{num1(pick.lambdaExplosive)}</dd>
            <dt className="text-ink/55">Gravity</dt>
            <dd className="text-right tabular-nums">{pick.gravity.toFixed(2)}</dd>
            <dt className="text-ink/55">Implied</dt>
            <dd className="text-right tabular-nums">{num1(pick.implied)}</dd>
            <dt className="text-ink/55">Rush share</dt>
            <dd className="text-right tabular-nums">{pct(pick.rushShare)}</dd>
            <dt className="text-ink/55">Target share</dt>
            <dd className="text-right tabular-nums">{pct(pick.tgtShare)}</dd>
          </dl>
          <ul className="mt-4 flex flex-col gap-1 text-xs leading-relaxed text-ink/60">
            {pick.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </aside>
      ) : null}
    </article>
  );
}

function PlayerSheet({ pick }: { pick: NflPick }) {
  const td = tdCount(pick);
  return (
    <>
      <SheetHeader>
        <SheetTitle className="font-display text-2xl">{pick.name}</SheetTitle>
        <p className="text-sm text-muted">
          {pick.pos} · {pick.team} vs {pick.opp} · {pct(pick.pTd)} anytime
        </p>
      </SheetHeader>
      <div className="flex flex-col gap-4 px-5 py-5 text-sm">
        {td > 0 ? <Badge variant="pine">{td} TD already</Badge> : null}
        <dl className="grid grid-cols-2 gap-y-2">
          <dt className="text-muted">Pass yds</dt>
          <dd className="text-right tabular-nums">
            {num1(pick.expPassYd)}
            {pick.actual ? ` · box ${Math.round(pick.actual.passYd)}` : ""}
          </dd>
          <dt className="text-muted">Rush yds</dt>
          <dd className="text-right tabular-nums">
            {num1(pick.expRushYd)}
            {pick.actual ? ` · box ${Math.round(pick.actual.rushYd)}` : ""}
          </dd>
          <dt className="text-muted">Rec yds</dt>
          <dd className="text-right tabular-nums">
            {num1(pick.expRecYd)}
            {pick.actual ? ` · box ${Math.round(pick.actual.recYd)}` : ""}
          </dd>
          <dt className="text-muted">Receptions</dt>
          <dd className="text-right tabular-nums">
            {num1(pick.expRec)}
            {pick.actual ? ` · box ${pick.actual.rec}` : ""}
          </dd>
          <dt className="text-muted">Fantasy</dt>
          <dd className="text-right tabular-nums">{num1(pick.expFantasy)}</dd>
        </dl>
        <ul className="flex flex-col gap-1 border-t border-border pt-3 text-xs leading-relaxed text-muted">
          {pick.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
        {pick.quotes.length ? (
          <ul className="flex flex-col gap-2 border-t border-border pt-3">
            {pick.quotes.map((q) => (
              <li key={`${q.market}-${q.line}`} className="flex justify-between tabular-nums">
                <span>
                  {q.stat} {q.line}
                </span>
                <span className="text-muted">{pct(q.cover)} over</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="border-t border-border pt-3 text-xs text-faint">No PrizePicks line matched.</p>
        )}
      </div>
    </>
  );
}
