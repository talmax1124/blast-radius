import { loadPublishedBoards } from "@/lib/research/functions";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Radar } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Nameplate, SectionFlag } from "@/components/desk/edition";
import { Button } from "@/components/ui/button";
import { loadSlateBoard, loadTennisSlate } from "@/lib/board/functions";
import {
  buildSlips,
  heatCells,
  mlbLegs,
  nflLegs,
  nhlLegs,
  tape,
  tennisLegs,
} from "@/lib/board/compose";
import { applyLedger, reportOf, toLedger } from "@/lib/board/grade";
import { buildPrice, formatAmerican, oddsBrief, parseAmerican, spreadRead } from "@/lib/board/odds";
import type { SlateBoard } from "@/lib/board/slate";
import type { BoardLeg, BoardSlip, LedgerLeg, Sport, SpotSize, TennisMatch } from "@/lib/board/types";
import type { AnalysisResult, SlipCard } from "@/lib/mlb/types";
import { analyzeNfl } from "@/lib/nfl/functions";
import { RZM } from "@/lib/nfl/score";
import type { NflBoard } from "@/lib/nfl/types";
import { analyzeNhl } from "@/lib/nhl/functions";
import { ICE } from "@/lib/nhl/score";
import type { NhlBoard } from "@/lib/nhl/types";
import { cn } from "@/lib/utils";

// Keep the legacy mixed/manual ledger untouched, but never reuse accidental grades.
const LEDGER_KEY = "great-run:board-auto-ledger-2";
const NHL_KEY = "great-run:nhl-board-2";
const NFL_KEY = "great-run:nfl-board-1";
const MLB_KEY = "great-run:last-analysis-32";

type Facet = "all" | Sport;

const GROUPS: { label: string; items: { id: Facet; label: string }[] }[] = [
  {
    label: "Slate",
    items: [
      { id: "all", label: "All" },
      { id: "nhl", label: "NHL" },
      { id: "nfl", label: "NFL" },
      { id: "mlb", label: "MLB" },
      { id: "nba", label: "NBA" },
      { id: "wnba", label: "WNBA" },
    ],
  },
  {
    label: "Soccer",
    items: [
      { id: "nwsl", label: "NWSL" },
      { id: "arg", label: "Argentina" },
      { id: "uru", label: "Uruguay" },
      { id: "col", label: "Colombia" },
    ],
  },
  {
    label: "Court",
    items: [{ id: "tennis", label: "Tennis" }],
  },
];

const SPOTS: SpotSize[] = [2, 3, 4, 6];

function loadJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}



function heatClass(p: number): string {
  if (p >= 0.75) return "bg-pine text-ink";
  if (p >= 0.65) return "bg-pine/45 text-fg";
  if (p >= 0.56) return "bg-elevated text-fg";
  return "bg-surface text-faint";
}

export function BoardDesk() {
  const [nhl, setNhl] = useState<NhlBoard | null>(null);
  const [nfl, setNfl] = useState<NflBoard | null>(null);
  const [mlb, setMlb] = useState<{ date: string; slips: SlipCard[] } | null>(null);
  const [tennis, setTennis] = useState<TennisMatch[] | null>(null);
  const [slate, setSlate] = useState<SlateBoard | null>(null);
  const [ledger, setLedger] = useState<LedgerLeg[]>([]);
  const [facet, setFacet] = useState<Facet>("all");
  const [size, setSize] = useState<SpotSize>(3);
  const [kind, setKind] = useState<"power" | "mix">("power");
  const [market, setMarket] = useState<string | null>(null);
  const [booted, setBooted] = useState(false);

  const nhlRun = useMutation({
    mutationFn: () => analyzeNhl(),
    onSuccess: (next) => {
      setNhl(next);
      try {
        localStorage.setItem(NHL_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    },
  });
  const nflRun = useMutation({
    mutationFn: () => analyzeNfl(),
    onSuccess: (next) => {
      setNfl(next);
      try {
        localStorage.setItem(NFL_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    },
  });
  const tennisRun = useMutation({
    mutationFn: () => loadTennisSlate(),
    onSuccess: (next) => setTennis(next),
  });
  const slateRun = useMutation({
    mutationFn: () => loadSlateBoard(),
    onSuccess: (next) => setSlate(next),
  });

  useEffect(() => {
    const savedNhl = loadJson<NhlBoard>(NHL_KEY);
    if (savedNhl?.model?.version === ICE.version && Array.isArray(savedNhl.skaters)) setNhl(savedNhl);
    const savedNfl = loadJson<NflBoard>(NFL_KEY);
    if (savedNfl?.model?.version === RZM.version && Array.isArray(savedNfl.props)) setNfl(savedNfl);
    const savedMlb = loadJson<{ date: string; result: AnalysisResult }>(MLB_KEY);
    if (savedMlb?.result?.slips) setMlb({ date: savedMlb.date, slips: savedMlb.result.slips });
    setLedger(loadJson<LedgerLeg[]>(LEDGER_KEY) ?? []);
    setBooted(true);
    void loadPublishedBoards().then((published) => {
      if (published.nhl) setNhl(published.nhl);
      else if (!savedNhl || savedNhl.date !== published.date) nhlRun.mutate();
      if (published.nfl) setNfl(published.nfl);
      else if (!savedNfl || savedNfl.date !== published.date) nflRun.mutate();
      if (published.mlb) setMlb({ date: published.date, slips: published.mlb.slips });
      if (published.board) { setSlate(published.board.slate); setTennis(published.board.tennis); }
      else { tennisRun.mutate(); slateRun.mutate(); }
    }).catch(() => {
      if (!savedNhl) nhlRun.mutate();
      if (!savedNfl) nflRun.mutate();
      tennisRun.mutate();
      slateRun.mutate();
    });
    // Cached NHL and NFL stay until Fetch. Tennis and the new slates refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!booted) return;
    try {
      localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger.slice(0, 400)));
    } catch {
      /* ignore */
    }
  }, [ledger, booted]);

  const date = slate?.date || nhl?.date || nfl?.date || mlb?.date || "";

  const raw = useMemo(() => {
    const legs: BoardLeg[] = [];
    if (nhl) legs.push(...nhlLegs(nhl));
    if (nfl) legs.push(...nflLegs(nfl));
    if (mlb) legs.push(...mlbLegs(mlb.date, mlb.slips));
    else if (slate) legs.push(...slate.legs.filter((leg) => leg.sport === "mlb"));
    if (slate) legs.push(...slate.legs.filter((leg) => leg.sport !== "mlb"));
    if (tennis && date) legs.push(...tennisLegs(date, tennis));
    return legs;
  }, [nhl, nfl, mlb, tennis, slate, date]);

  useEffect(() => {
    const fresh = raw.filter((leg) => leg.settled);
    if (!fresh.length) return;
    setLedger((prev) => {
      const known = new Set(prev.map((row) => row.id));
      const add = fresh.filter((leg) => !known.has(leg.id));
      if (!add.length) return prev;
      return [...add.map((leg) => toLedger(leg, leg.settled === "miss" ? "miss" : "hit")), ...prev];
    });
  }, [raw]);

  const legs = useMemo(() => applyLedger(raw, ledger), [raw, ledger]);
  const scoped = facet === "all" ? legs : legs.filter((l) => l.sport === facet);
  const filtered = market ? scoped.filter((l) => l.market === market) : scoped;
  const slips = useMemo(() => buildSlips(filtered, facet), [filtered, facet]);
  const slip: BoardSlip | null = slips.find((s) => s.size === size && s.kind === kind) ?? null;
  const markets = useMemo(() => {
    const map = new Map<string, string>();
    for (const leg of scoped) if (!map.has(leg.market)) map.set(leg.market, leg.marketLabel);
    return [...map.entries()];
  }, [scoped]);
  const cells = useMemo(() => heatCells(filtered), [filtered]);
  const rows = useMemo(() => {
    const scored = [...new Set(cells.map((c) => c.row))].map((row) => ({
      row,
      p: Math.max(...cells.filter((c) => c.row === row).map((c) => c.p)),
    }));
    return scored
      .sort((a, b) => b.p - a.p)
      .slice(0, 12)
      .map((row) => row.row);
  }, [cells]);
  const cols = useMemo(() => {
    const inView = new Set(rows);
    return [...new Set(cells.filter((cell) => inView.has(cell.row)).map((cell) => cell.col))];
  }, [cells, rows]);
  const listed = tape(filtered, null);
  const report = reportOf(ledger);
  const busy = nhlRun.isPending || nflRun.isPending || tennisRun.isPending || slateRun.isPending;
  const waiting = (slate?.games ?? []).filter((game) => {
    if (game.priced || game.state !== "pre") return false;
    return facet === "all" || game.sport === facet;
  });
  const legGames = new Set(raw.map((leg) => leg.gameId));
  const tossups = (slate?.games ?? []).filter((game) => {
    if (!game.priced || game.state !== "pre" || legGames.has(game.id)) return false;
    return facet !== "all" && game.sport === facet;
  });
  const prices = useMemo(() => {
    const rows = [];
    for (const game of nhl?.games ?? []) {
      const card = buildPrice({
        id: `nhl:${game.id}`,
        sport: "nhl",
        label: `${game.away} @ ${game.home}`,
        total: game.total,
        sides: [
          { name: game.awayName, american: parseAmerican(game.awayMl) ?? 0 },
          { name: game.homeName, american: parseAmerican(game.homeMl) ?? 0 },
        ].filter((side) => side.american !== 0),
      });
      if (card) rows.push(card);
    }
    for (const card of slate?.prices ?? []) rows.push(card);
    const scopedPrices = facet === "all" ? rows : rows.filter((row) => row.sport === facet);
    return scopedPrices.sort((a, b) => b.fair - a.fair).slice(0, 10);
  }, [nhl, slate, facet]);
  const brief = oddsBrief(prices);
  const spreads = (facet === "all" || facet === "nfl" ? (nfl?.games ?? []) : [])
    .map((game) => {
      const row = game.spreadLabel ? spreadRead(game.spreadLabel) : null;
      if (!row) return null;
      return { id: game.id, label: `${game.away} @ ${game.home}`, total: game.total, ...row };
    })
    .filter((row) => row != null)
    .slice(0, 8);

  function countOf(id: Facet): string {
    if (id === "all") {
      const games = new Set(legs.map((leg) => `${leg.sport}:${leg.gameId}`));
      for (const game of slate?.games ?? []) games.add(`${game.sport}:${game.id}`);
      for (const game of nhl?.games ?? []) games.add(`nhl:${game.id}`);
      for (const game of nfl?.games ?? []) games.add(`nfl:${game.id}`);
      return games.size ? String(games.size) : "—";
    }
    if (id === "nhl") return nhl ? String(nhl.games.length) : "…";
    if (id === "nfl") return nfl ? String(nfl.games.length) : "…";
    if (id === "tennis") return tennis ? String(tennis.filter((m) => m.state === "pre").length) : "…";
    const games = slate?.games.filter((game) => game.sport === id).length;
    if (games == null) return "…";
    if (id === "mlb" && mlb) return `${games} · card`;
    return String(games);
  }

  function refresh() {
    nhlRun.mutate();
    nflRun.mutate();
    tennisRun.mutate();
    slateRun.mutate();
  }

  const emptyCopy = !booted
    ? "Opening the book."
    : busy
      ? "Pulling today’s slates."
      : waiting.length > 0 && scoped.length === 0
        ? "Books have not posted a price for these games."
        : tossups.length > 0 && scoped.length === 0
          ? "No side is a favorite once the draw is included."
          : "Not enough independent legs at this size. Drop a spot, or fetch the slate.";

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="kicker">{date || "Today"}</p>
          <Button size="lg" onClick={refresh} disabled={busy} className="w-full sm:w-auto">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Radar className="size-4" />}
            {busy ? "Refitting" : "Fetch & refit"}
          </Button>
        </div>
        <Nameplate sport="board" />
        <p className="font-serif mx-auto max-w-xl text-center text-sm leading-snug text-muted sm:text-base">
          <span className="font-display font-semibold text-fg not-italic">One card across the slate</span>
          <span> — a spot is one game. A league without a number stays off it.</span>
        </p>
        {(slate?.aside ?? []).map((line) => (
          <p key={line} className="mx-auto max-w-2xl text-center text-xs leading-relaxed text-faint">
            {line}
          </p>
        ))}
      </header>

      <div className="flex flex-col gap-px bg-border">
        {GROUPS.map((group) => (
          <div key={group.label} className="grid grid-cols-1 bg-border sm:grid-cols-[5.5rem_minmax(0,1fr)]">
            <div className="flex items-center bg-bg px-3 py-2 sm:py-0">
              <p className="kicker">{group.label}</p>
            </div>
            <div className="grid grid-cols-2 gap-px sm:grid-cols-3 lg:grid-cols-6">
              {group.items.map((item) => {
                const active = facet === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setFacet(item.id);
                      setMarket(null);
                    }}
                    className={cn(
                      "flex h-14 flex-col items-start justify-center px-3 text-left",
                      active ? "bg-paper text-ink" : "bg-surface text-fg hover:bg-elevated",
                    )}
                  >
                    <span className="text-sm font-medium">{item.label}</span>
                    <span className={cn("text-xs tabular-nums", active ? "text-ink/50" : "text-faint")}>
                      {countOf(item.id)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(16rem,0.75fr)]">
        <article className="border border-border bg-paper px-5 py-6 text-ink sm:px-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="kicker text-ink/45">Recommended slip</p>
            <div className="flex gap-1">
              {SPOTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setSize(n)}
                  className={cn(
                    "h-11 min-w-11 px-2 text-sm tabular-nums",
                    size === n ? "bg-ink text-paper" : "text-ink/45 hover:text-ink",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-2 flex gap-4 border-b border-ink/10 pb-3">
            <button
              type="button"
              onClick={() => setKind("power")}
              className={cn("h-9 text-xs tracking-wide", kind === "power" ? "text-ink" : "text-ink/40")}
            >
              Power
            </button>
            <button
              type="button"
              onClick={() => setKind("mix")}
              className={cn("h-9 text-xs tracking-wide", kind === "mix" ? "text-ink" : "text-ink/40")}
            >
              Mix props
            </button>
          </div>
          {slip ? (
            <>
              <h2 className="font-display mt-4 text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">{slip.title}</h2>
              <p className="font-serif mt-2 text-base text-ink/70 italic">{pct(slip.sweep)} to sweep. One player per game.</p>
              <ul className="mt-4 flex flex-col">
                {slip.legs.map((leg) => (
                  <SlipRow key={leg.id} leg={leg} />
                ))}
              </ul>
            </>
          ) : (
            <p className="font-serif mt-4 text-base text-ink/70 italic">{emptyCopy}</p>
          )}
          <p className="mt-4 text-xs leading-relaxed text-ink/60">
            Results update from game data. Manual grading is disabled; previous manual marks no longer affect this board.
          </p>
          {waiting.length > 0 ? (
            <p className="mt-4 text-xs leading-relaxed text-ink/45">
              Waiting on a price: {waiting.map((game) => `${game.sport.toUpperCase()} ${game.label}`).join(", ")}.
            </p>
          ) : null}
          {tossups.length > 0 ? (
            <p className="mt-4 text-xs leading-relaxed text-ink/45">
              No favorite after the draw: {tossups.map((game) => game.label).join(", ")}.
            </p>
          ) : null}
        </article>
        <aside className="border border-border bg-surface px-5 py-5">
          <p className="kicker">Sweep chart</p>
          <ul className="mt-4 flex flex-col gap-3">
            {SPOTS.map((n) => {
              const card = slips.find((s) => s.size === n && s.kind === kind);
              const w = card ? Math.max(4, Math.round(card.sweep * 100)) : 0;
              return (
                <li key={n}>
                  <div className="flex items-baseline justify-between text-xs text-muted">
                    <span className="tabular-nums">{n}-spot</span>
                    <span className="tabular-nums text-fg">{card ? pct(card.sweep) : "—"}</span>
                  </div>
                  <div className="mt-1 h-2 bg-elevated">
                    <div className="h-2 bg-pine" style={{ width: `${w}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-faint">
            The bar is the joint probability. One spot per game, so the legs are not the same game three times.
          </p>
        </aside>
      </section>

      <section className="flex flex-col gap-3">
        <SectionFlag>Odds</SectionFlag>
        <div className="grid gap-px bg-border lg:grid-cols-[minmax(0,1.15fr)_minmax(16rem,0.85fr)]">
          <article className="bg-paper px-5 py-6 text-ink sm:px-7">
            <p className="kicker text-ink/45">The price</p>
            <h2 className="font-display mt-2 text-3xl leading-tight font-semibold tracking-tight">What the number is saying</h2>
            {brief.lines.map((line) => (
              <p key={line} className="mt-3 max-w-prose text-sm leading-relaxed text-ink/80">
                {line}
              </p>
            ))}
          </article>
          <aside className="bg-surface px-5 py-5">
            <p className="kicker">Hold</p>
            <p className="font-display mt-3 text-4xl font-semibold tabular-nums text-fg">
              {brief.hold == null ? "—" : `${(brief.hold * 100).toFixed(1)}`}
              <span className="ml-1 text-base font-medium text-muted">pts</span>
            </p>
            <p className="mt-2 text-xs leading-relaxed text-faint">
              Average juice across the posted moneylines in this cut. A higher number means the book keeps more before anyone wins.
            </p>
            <div className="mt-4 h-2 bg-elevated">
              <div className="h-2 bg-pine" style={{ width: `${Math.min(100, Math.round((brief.hold ?? 0) * 400))}%` }} />
            </div>
          </aside>
        </div>
        {prices.length > 0 ? (
          <div className="overflow-x-auto border border-border">
            <table className="w-full min-w-[40rem] border-collapse text-left">
              <thead>
                <tr>
                  {["Game", "Book", "No-vig", "Hold", "Read"].map((heading) => (
                    <th key={heading} className="kicker bg-surface px-3 py-3 font-medium">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {prices.map((card) => (
                  <tr key={card.id} className="border-t border-border align-top">
                    <th className="px-3 py-3 text-left text-xs font-medium whitespace-nowrap text-fg">
                      {card.sport.toUpperCase()} {card.label}
                    </th>
                    <td className="px-3 py-3 text-xs whitespace-nowrap text-muted tabular-nums">
                      {card.sides.map((side) => `${side.name.split(" ").slice(-1)[0]} ${formatAmerican(side.american)}`).join(" · ")}
                    </td>
                    <td className="px-3 py-3 text-xs whitespace-nowrap text-fg tabular-nums">
                      {card.favorite.split(" ").slice(-1)[0]} {pct(card.fair)}
                    </td>
                    <td className={cn("px-3 py-3 text-xs whitespace-nowrap tabular-nums", card.hold >= 0.07 ? "text-brick" : "text-muted")}>
                      {(card.hold * 100).toFixed(1)}
                    </td>
                    <td className="px-3 py-3 text-xs leading-relaxed text-muted">{card.read}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {spreads.length > 0 ? (
          <ul className="grid gap-px bg-border sm:grid-cols-2">
            {spreads.map((row) => (
              <li key={row.id} className="bg-surface px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm text-fg">{row.label}</p>
                  <p className="text-xs tabular-nums text-muted">{row.favorite} {row.points > 0 ? `−${row.points}` : "PK"}</p>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-faint">
                  {row.read}
                  {row.total != null ? ` Total ${row.total}.` : ""}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="panel p-5">
        <p className="kicker">Evidence before a projection</p>
        <h2 className="mt-2 text-xl font-medium">Research the matchup</h2>
        <p className="mt-2 text-sm text-muted">
          Inspect game logs, reported lineups, injuries, and market prices. Historical hit rates
          describe the sample; they are not a calibrated forecast.
        </p>
        <a className="mt-4 inline-block text-sm text-pine hover:underline" href="/research">
          Open the research workbench →
        </a>
      </section>

      <section className="flex flex-col gap-3">
        <SectionFlag>Prop types</SectionFlag>
        <div className="flex gap-2 overflow-x-auto">
          <Filter active={market == null} onClick={() => setMarket(null)}>
            All types
          </Filter>
          {markets.map(([id, label]) => (
            <Filter key={id} active={market === id} onClick={() => setMarket(id)}>
              {label}
            </Filter>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionFlag>Heat map</SectionFlag>
        {rows.length === 0 ? (
          <p className="font-serif text-sm text-muted italic">
            {waiting.length ? "No cells until a book posts a number." : "No cells yet. The map fills when a slate is in."}
          </p>
        ) : (
          <div className="overflow-x-auto border border-border">
            <table className="w-full min-w-[36rem] border-collapse text-left">
              <thead>
                <tr>
                  <th className="kicker sticky left-0 z-10 min-w-40 bg-surface px-3 py-3 text-left font-medium">Game</th>
                  {cols.map((col) => (
                    <th key={col} className="kicker bg-surface px-3 py-3 text-center font-medium whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row} className="border-t border-border">
                    <th className="sticky left-0 z-10 bg-bg px-3 py-2 text-left text-xs font-medium whitespace-nowrap text-fg">{row}</th>
                    {cols.map((col) => {
                      const cell = cells.find((c) => c.row === row && c.col === col);
                      return (
                        <td key={col} className="p-1">
                          {cell ? (
                            <div className={cn("flex min-h-11 flex-col justify-center px-2 py-1", heatClass(cell.p))}>
                              <span className="truncate text-xs font-medium">{cell.name.split(" ").slice(-1)[0]}</span>
                              <span className="text-xs tabular-nums opacity-80">{pct(cell.p)}</span>
                            </div>
                          ) : (
                            <div className="min-h-11 bg-bg" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-faint">Darker green is a higher probability, not a bigger payout.</p>
      </section>

      <section className="flex flex-col gap-3">
        <SectionFlag>The tape</SectionFlag>
        {listed.length === 0 ? (
          <p className="font-serif text-sm text-muted italic">Nothing priced in this cut.</p>
        ) : (
          <ul className="grid gap-px bg-border sm:grid-cols-2">
            {listed.map((leg) => (
              <li key={leg.id} className="bg-surface px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="truncate text-sm text-fg">{leg.name}</p>
                  <p className="shrink-0 text-sm tabular-nums text-pine">{pct(leg.p)}</p>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {leg.sport.toUpperCase()} · {leg.prop}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-faint">{leg.note}</p>
                <GradeStatus leg={leg} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-px bg-border lg:grid-cols-[minmax(0,1.25fr)_minmax(16rem,0.75fr)]">
        <article className="bg-paper px-5 py-6 text-ink sm:px-7">
          <p className="kicker text-ink/45">Self-analysis</p>
          <h2 className="font-display mt-2 text-3xl leading-tight font-semibold tracking-tight">The book on itself</h2>
          {report.lines.map((line) => (
            <p key={line} className="mt-3 max-w-prose text-sm leading-relaxed text-ink/80">
              {line}
            </p>
          ))}
          {report.n > 0 ? (
            <p className="mt-4 text-xs tabular-nums text-ink/50">
              Brier {report.brier?.toFixed(3)} · expected {report.expected.toFixed(1)} · hit {report.hits}
            </p>
          ) : null}
        </article>
        <aside className="bg-surface px-5 py-5">
          <p className="kicker">Calibration</p>
          <ul className="mt-4 flex flex-col gap-3">
            {report.buckets.map((bucket) => {
              const rate = bucket.n ? bucket.hits / bucket.n : 0;
              const expect = bucket.n ? bucket.expected / bucket.n : 0;
              return (
                <li key={bucket.label}>
                  <div className="flex items-baseline justify-between text-xs text-muted">
                    <span>{bucket.label}</span>
                    <span className="tabular-nums text-fg">{bucket.n ? `${pct(rate)} hit · ${pct(expect)} priced` : "—"}</span>
                  </div>
                  <div className="mt-1 h-2 bg-elevated">
                    <div className="h-2 bg-pine" style={{ width: `${Math.round(rate * 100)}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
          {report.byMarket.length > 0 ? (
            <ul className="mt-5 flex flex-col gap-2 border-t border-border pt-4">
              {report.byMarket.slice(0, 6).map((row) => (
                <li key={row.key} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="truncate text-muted">
                    {row.sport.toUpperCase()} {row.label}
                  </span>
                  <span className="tabular-nums text-fg">
                    {row.hits}/{row.n}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </aside>
      </section>
    </main>
  );
}

function Filter({ active, children, onClick }: { active: boolean; children: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-11 shrink-0 px-3 text-xs tracking-wide",
        active ? "bg-paper text-ink" : "bg-elevated text-muted hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

function SlipRow({ leg }: { leg: BoardLeg }) {
  return (
    <li className="border-t border-ink/10 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium">{leg.name}</p>
        <p className="text-sm tabular-nums">{pct(leg.p)}</p>
      </div>
      <p className="mt-1 text-xs text-ink/60">
        {leg.sport.toUpperCase()} · {leg.team} · {leg.prop}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-ink/45">{leg.note}</p>
      <GradeStatus leg={leg} ink />
    </li>
  );
}

function GradeStatus({ leg, ink = false }: { leg: BoardLeg; ink?: boolean }) {
  if (!leg.settled) return null;
  return (
    <p className={cn("mt-2 text-xs", ink ? "text-ink/60" : "text-muted")}>
      Source result: {leg.settled === "hit" ? "Won" : "Lost"}
    </p>
  );
}
