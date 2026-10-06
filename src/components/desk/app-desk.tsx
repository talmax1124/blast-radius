import { useMutation, useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  CloudSun,
  Gauge,
  Loader2,
  Radar,
  Wind,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArsenalLab, MixBar, PitchGlossaryCard, PitchTable } from "@/components/desk/arsenal-lab";
import { EdgeGlossaryCard, EdgesLab } from "@/components/desk/edges-lab";
import { Nameplate } from "@/components/desk/edition";
import { GradesLab } from "@/components/desk/grades-lab";
import { SlipsLab } from "@/components/desk/slips-lab";
import { WireLab } from "@/components/desk/wire-lab";
import { BooksLab } from "@/components/desk/books-lab";
import { TapeLab } from "@/components/desk/tape-lab";
import { SourcesLab } from "@/components/desk/sources-lab";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { analyzePicks, getSlate, gradeCards, loadLedger, tickDesk, trackOdds } from "@/lib/mlb/functions";
import { SABER_GLOSSARY } from "@/lib/mlb/glossary";
import { editionCopy, type EditionCopy } from "@/lib/mlb/copy";
import { applyGrades, ledgerRate, mergeLedger, mergeLog, pendingCards, type DeskLogEntry } from "@/lib/mlb/recap";
import { formatUnits, ledgerReport } from "@/lib/mlb/grade";
import { formatGameTime, headshotUrl, teamLogoUrl, todayEt } from "@/lib/mlb/parse";
import { familyFill } from "@/lib/mlb/pitches";
import { leanFrom } from "@/lib/mlb/score";
import type {
  AnalysisResult,
  ArsenalCard,
  BatterPick,
  GameCard,
  Lean,
  PitcherPick,
  PropEdge,
  SaberCard,
  SaberRow,
} from "@/lib/mlb/types";

const STORAGE_KEY = "great-run:last-analysis-32";
const LOG_KEY = "great-run:card-log-30";
const LOADING_COPY = [
  "Pulling the MLB slate",
  "Reading RotoWire batting orders",
  "Pricing PrizePicks lines",
  "Pulling Savant barrels and expected stats",
  "Reading Statcast pitch types",
  "Loading platoon, sprint, and catcher pops",
  "Pulling last 6 days of box scores",
  "Pricing starter K/BF, outing length, and mix whiff",
  "Shopping PrizePicks against the books",
  "Taping moneyline, total, and player-prop odds",
  "Weighting barrels, launch, pull-air, porch, night splits, and HR clock",
  "Flagging recency, reverse platoon, and openers",
  "Building 2-, 3-, and 6-man slips",
];

type BoardMarket = keyof AnalysisResult["picks"];
type DeskTab = BoardMarket | "savant" | "arsenal" | "edges" | "slips" | "grades" | "wire" | "tape" | "books" | "sources";

const TABS: { id: DeskTab; label: string }[] = [
  { id: "hr", label: "Great Run" },
  { id: "slips", label: "Slips" },
  { id: "grades", label: "Grades" },
  { id: "wire", label: "Wire" },
  { id: "tape", label: "Tape" },
  { id: "books", label: "Books" },
  { id: "sources", label: "Sources" },
  { id: "hits", label: "Hits" },
  { id: "tb", label: "Total bases" },
  { id: "rbi", label: "RBI" },
  { id: "sb", label: "Steals" },
  { id: "k", label: "Pitcher Ks" },
  { id: "edges", label: "Edges" },
  { id: "arsenal", label: "Arsenal" },
  { id: "savant", label: "Savant" },
];

type SortKey = "barrelPa" | "xslg" | "xwoba" | "xba" | "wrcPlus" | "hardHit" | "luckSlg";

const SORTS: { id: SortKey; label: string }[] = [
  { id: "barrelPa", label: "Brl/PA" },
  { id: "xslg", label: "xSLG" },
  { id: "xwoba", label: "xwOBA" },
  { id: "xba", label: "xBA" },
  { id: "wrcPlus", label: "wRC+" },
  { id: "hardHit", label: "Hard hit" },
  { id: "luckSlg", label: "Due" },
];

type Saved = { date: string; result: AnalysisResult };

export type CardLogEntry = DeskLogEntry;

function loadSaved(date: string): AnalysisResult | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Saved;
    if (
      parsed.date === date &&
      parsed.result?.picks?.hr &&
      Array.isArray(parsed.result.saberBoard) &&
      Array.isArray(parsed.result.arsenals) &&
      Array.isArray(parsed.result.edges) &&
      Array.isArray(parsed.result.slips) &&
      parsed.result.model?.version === "3.3"
    ) {
      return parsed.result;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function loadLog(): DeskLogEntry[] {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    if (!raw) return mergeLog([]);
    const parsed = JSON.parse(raw) as DeskLogEntry[];
    return mergeLog(Array.isArray(parsed) ? parsed.filter((e) => e?.date && Array.isArray(e.slips)) : []);
  } catch {
    return mergeLog([]);
  }
}

function persistLog(log: DeskLogEntry[]) {
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(log.slice(0, 8)));
  } catch {
    /* ignore */
  }
}

function saveLog(result: AnalysisResult) {
  try {
    const log = loadLog().filter((e) => e.date !== result.date);
    log.unshift({
      date: result.date,
      version: result.model.version,
      slips: result.slips,
      grade: result.grade,
    });
    persistLog(log);
  } catch {
    /* ignore */
  }
}

function patchSaved(date: string, slips: AnalysisResult["slips"], grade: AnalysisResult["grade"]) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Saved;
    if (parsed.date !== date || !parsed.result) return;
    parsed.result = { ...parsed.result, slips, grade };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    /* ignore */
  }
}

function saveResult(date: string, result: AnalysisResult) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ date, result }));
    saveLog(result);
  } catch {
    /* ignore */
  }
}

function leanVariant(lean: Lean): "smash" | "strong" | "lean" | "spec" {
  return lean;
}

function fmt3(n: number | null | undefined): string {
  return n == null || !Number.isFinite(n) ? "—" : n.toFixed(3);
}

function fmt1(n: number | null | undefined, suffix = ""): string {
  return n == null || !Number.isFinite(n) ? "—" : `${n.toFixed(1)}${suffix}`;
}

function fmt0(n: number | null | undefined): string {
  return n == null || !Number.isFinite(n) ? "—" : String(Math.round(n));
}

function luckDelta(actual: number, expected: number | null | undefined): number | null {
  if (expected == null || !Number.isFinite(expected)) return null;
  return actual - expected;
}

function luckTone(delta: number | null): "pine" | "brick" | "default" {
  if (delta == null) return "default";
  if (delta <= -0.02) return "pine";
  if (delta >= 0.02) return "brick";
  return "default";
}

function luckLabel(delta: number | null): string {
  if (delta == null) return "—";
  const signed = `${delta >= 0 ? "+" : ""}${delta.toFixed(3)}`;
  if (delta <= -0.02) return `${signed} due`;
  if (delta >= 0.02) return `${signed} lucky`;
  return signed;
}

function saberValue(row: SaberRow, key: SortKey): number {
  if (key === "luckSlg") {
    const d = luckDelta(row.slg, row.saber.xslg);
    return d ?? Number.POSITIVE_INFINITY;
  }
  const v = row.saber[key];
  return v ?? Number.NEGATIVE_INFINITY;
}

function findBatter(result: AnalysisResult, playerId: number): BatterPick | null {
  for (const key of ["hr", "hits", "tb", "rbi", "sb"] as const) {
    const hit = result.picks[key].find((p) => p.playerId === playerId);
    if (hit) return hit;
  }
  const row = result.saberBoard.find((r) => r.playerId === playerId);
  return row ? saberToPick(row) : null;
}

function saberToPick(row: SaberRow): BatterPick {
  const score = row.hrScore ?? 0;
  return {
    rank: 0,
    playerId: row.playerId,
    name: row.name,
    teamId: 0,
    teamAbbr: row.teamAbbr,
    opponentAbbr: row.opponentAbbr,
    opponentId: 0,
    gamePk: row.gamePk,
    venueName: row.venueName ?? "",
    batSide: null,
    pitcherName: row.pitcherName ?? null,
    pitcherHand: null,
    lineupSlot: 0,
    market: "hr",
    score,
    lean: leanFrom(score || 50),
    impliedHr: 0,
    hrPct: 0,
    reasons: [],
    factors: [],
    season: {
      pa: row.pa ?? 0,
      ab: 0,
      hr: row.hr ?? 0,
      hits: 0,
      avg: row.avg,
      obp: 0,
      slg: row.slg,
      iso: row.iso,
      ops: 0,
      rbi: 0,
      runs: 0,
      sb: 0,
      k: 0,
      tb: 0,
      babip: 0,
      abPerHr: 0,
    },
    recent: null,
    flags: [],
    reversePlatoon: false,
    opener: false,
    mixBarrel: null,
    mixXwoba: null,
    dmgMult: 1,
    hrMult: 1,
    gameState: "Preview",
    weather: null,
    parkHrFactor: 0,
    note: null,
    saber: row.saber,
    vsPitches: row.vsPitches ?? [],
    matchup: row.matchup ?? null,
    edge: row.edge ?? null,
    isHome: false,
    propLine: null,
    inLineup: true,
    lineupStatus: "none",
  };
}

function findPitcher(result: AnalysisResult, playerId: number): PitcherPick | null {
  const hit = result.picks.k.find((p) => p.playerId === playerId);
  if (hit) return hit;
  const card = result.arsenals.find((row) => row.playerId === playerId);
  return card ? arsenalToPick(card) : null;
}

function arsenalToPick(row: ArsenalCard): PitcherPick {
  return {
    rank: 0,
    playerId: row.playerId,
    name: row.name,
    teamId: 0,
    teamAbbr: row.teamAbbr,
    opponentAbbr: row.opponentAbbr,
    gamePk: row.gamePk,
    venueName: row.venueName,
    hand: row.pitcher.hand,
    market: "k",
    score: 0,
    lean: leanFrom(50),
    reasons: [],
    factors: [],
    pitcher: row.pitcher,
    oppKRate: 0,
    impliedK: 0,
    kRate: 0,
    note: null,
    parkKFactor: 0,
    propLine: null,
    gameState: "Preview",
  };
}

function trailStat(pick: BatterPick | PitcherPick): string {
  if (pick.propLine) {
    const side = pick.propLine.side === "over" ? "O" : "U";
    return `${side} ${pick.propLine.line}`;
  }
  if (pick.market === "k") {
    const p = pick as PitcherPick;
    if (p.impliedK > 0) {
      return p.propLine ? `${p.impliedK.toFixed(1)} vs ${p.propLine.line}` : `${p.impliedK.toFixed(1)} K`;
    }
    const primary = p.pitcher.arsenal[0];
    if (primary?.whiff != null) return `${primary.code} ${primary.whiff.toFixed(0)}%`;
    return p.kRate > 0 ? `${(p.kRate * 100).toFixed(0)}% K` : `${p.pitcher.k9.toFixed(1)} K/9`;
  }
  const b = pick as BatterPick;
  if (pick.market === "hits") {
    return b.saber?.xba != null ? `${b.saber.xba.toFixed(3)} xBA` : b.season.avg.toFixed(3);
  }
  if (pick.market === "tb") {
    return b.saber?.xslg != null ? `${b.saber.xslg.toFixed(3)} xSLG` : b.season.slg.toFixed(3);
  }
  if (pick.market === "rbi") return `${b.season.rbi} RBI`;
  if (pick.market === "sb") {
    return b.edge?.sprint != null ? `${b.edge.sprint.toFixed(1)} ft/s` : b.saber?.spd != null ? `${b.saber.spd.toFixed(1)} SPD` : `${b.season.sb} SB`;
  }
  return b.saber?.barrelPa != null ? `${b.saber.barrelPa.toFixed(1)} brl` : `${b.season.hr} HR`;
}

export function AppDesk() {
  const [date, setDate] = useState(todayEt);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [tab, setTab] = useState<DeskTab>("hr");
  const [selected, setSelected] = useState<BatterPick | PitcherPick | null>(null);
  const [stage, setStage] = useState(0);
  const [cardLog, setCardLog] = useState<DeskLogEntry[]>([]);
  const seenComplete = useRef(new Set<string>());
  const autoTried = useRef("");
  const tabReady = useRef("");

  const slateQuery = useQuery({
    queryKey: ["slate", date],
    queryFn: () => getSlate({ data: { date } }),
  });

  const ledgerQuery = useQuery({
    queryKey: ["ledger"],
    queryFn: () => loadLedger({ data: {} }),
    refetchInterval: 120_000,
  });

  const tapeQuery = useQuery({
    queryKey: ["odds-tape", date],
    queryFn: () => trackOdds({ data: { date } }),
    refetchInterval: date === todayEt() ? 180_000 : false,
    staleTime: 60_000,
  });

  const analyze = useMutation({
    mutationFn: () => analyzePicks({ data: { date } }),
    onSuccess: (data) => {
      setResult(data);
      saveResult(date, data);
      setCardLog(loadLog());
      setTab("hr");
      void ledgerQuery.refetch();
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Could not analyze the slate");
    },
  });

  const tick = useMutation({
    mutationFn: () => tickDesk({ data: { date } }),
    onSuccess: (data) => {
      if (data.result) {
        setResult(data.result);
        saveResult(data.date, data.result);
        if (data.result.slips.length) setTab("hr");
      }
      setCardLog(loadLog());
      void ledgerQuery.refetch();
      if (data.action === "published") toast.success("Great Run posted tonight's card");
      if (data.action === "skipped") toast("Great Run skipped tonight — not a loss");
      if (data.action === "error") toast.error(data.note);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Great Run could not post");
    },
  });

  useEffect(() => {
    const saved = loadSaved(date);
    const local = loadLog();
    const merged = ledgerQuery.data ? mergeLedger(ledgerQuery.data, local) : local;
    setCardLog(merged);
    persistLog(merged);
    const fromDb = ledgerQuery.data?.find((d) => d.date === date)?.analysis ?? null;
    const next = fromDb ?? saved;
    if (next) {
      const day = merged.find((e) => e.date === date);
      const hydrated =
        day?.slips.length
          ? { ...next, slips: day.slips, grade: day.grade }
          : next;
      setResult(hydrated);
      saveResult(date, hydrated);
      if (tabReady.current !== date) {
        setTab("hr");
        tabReady.current = date;
      }
      return;
    }
    setResult(saved);
    if (saved && tabReady.current !== date) {
      setTab("hr");
      tabReady.current = date;
    }
  }, [date, ledgerQuery.data]);

  useEffect(() => {
    if (analyze.isPending || tick.isPending) {
      const id = window.setInterval(() => setStage((s) => (s + 1) % LOADING_COPY.length), 2200);
      return () => window.clearInterval(id);
    }
    setStage(0);
    return undefined;
  }, [analyze.isPending, tick.isPending]);

  useEffect(() => {
    if (date !== todayEt()) return;
    if (ledgerQuery.isLoading) return;
    if (analyze.isPending || tick.isPending) return;
    if (autoTried.current === date) return;
    const posted =
      Boolean(loadSaved(date)?.slips.length) ||
      Boolean(result?.date === date && result.slips.length) ||
      Boolean(cardLog.find((e) => e.date === date && e.slips.length));
    autoTried.current = date;
    if (!posted) tick.mutate();
  }, [date, ledgerQuery.isLoading, analyze.isPending, tick.isPending, result, cardLog, tick]);

  const pending = useMemo(() => pendingCards(cardLog, todayEt()), [cardLog]);
  const pendingKey = pending.map((p) => `${p.date}:${p.slips.flatMap((s) => s.legs.map((l) => l.playerId)).join("-")}`).join("|");

  const gradeQuery = useQuery({
    queryKey: ["grade-cards", pendingKey],
    queryFn: () => gradeCards({ data: { cards: pending } }),
    enabled: pending.length > 0,
    refetchInterval: 90_000,
  });

  useEffect(() => {
    const updates = gradeQuery.data;
    if (!updates?.length) return;
    setCardLog((prev) => {
      const next = applyGrades(prev, updates);
      persistLog(next);
      return next;
    });
    setResult((prev) => {
      if (!prev) return prev;
      const u = updates.find((x) => x.date === prev.date);
      if (!u) return prev;
      patchSaved(prev.date, u.slips, u.grade);
      return { ...prev, slips: u.slips, grade: u.grade };
    });
    for (const u of updates) {
      if (u.complete && u.grade && u.grade.n > 0 && !seenComplete.current.has(u.date)) {
        seenComplete.current.add(u.date);
        toast.success(`${u.date} graded ${u.grade.hits}/${u.grade.n}`);
      }
    }
  }, [gradeQuery.data]);

  useEffect(() => {
    const tape = tapeQuery.data;
    if (!tape?.games.length && !tape?.props.length && !tape?.ticks) return;
    setResult((prev) => {
      if (!prev || prev.date !== date) return prev;
      return { ...prev, tape };
    });
  }, [tapeQuery.data, date]);

  const games = result?.games ?? slateQuery.data?.games ?? [];
  const roll = ledgerRate(cardLog);
  const book = ledgerReport(cardLog);
  const ledgerLabel =
    roll.n > 0
      ? `${roll.hits}/${roll.n}${book.units != null ? ` · ${formatUnits(book.units)}` : ""}`
      : null;
  const edition = useMemo(
    () => editionCopy({ date, log: cardLog, games: games.length }),
    [date, cardLog, games.length],
  );
  const labTab = tab === "savant" || tab === "arsenal" || tab === "edges" || tab === "slips" || tab === "grades" || tab === "wire" || tab === "tape" || tab === "books" || tab === "sources";
  const market: BoardMarket = labTab ? "hr" : (tab as BoardMarket);
  const picks = result && !labTab ? result.picks[market] : [];
  const featured = !labTab ? (picks[0] as BatterPick | PitcherPick | undefined) : null;
  const wide = tab === "slips" || tab === "grades" || tab === "wire" || tab === "tape" || tab === "books" || tab === "sources";
  const busy = analyze.isPending || tick.isPending;

  return (
    <div className="min-h-dvh bg-bg">
      <a className="desk-skip" href="#desk-content">Skip to analysis</a>
      <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-8 px-4 pt-5 pb-20 sm:px-6 lg:px-8">
        <Header
          copy={edition}
          date={date}
          onDate={setDate}
          loading={busy}
          onAnalyze={() => analyze.mutate()}
          gameCount={games.length}
          ledger={ledgerLabel}
        />

        <div className="desk-metrics" aria-label="Analysis coverage">
          <div className="desk-metric"><span>Games on the slate</span><strong>{slateQuery.isPending ? "—" : games.length}</strong><span>{date} · Eastern</span></div>
          <div className="desk-metric"><span>Priced lines</span><strong>{result?.lineCount ?? "—"}</strong><span>Current analysis snapshot</span></div>
          <div className="desk-metric"><span>Research inputs</span><strong>{result?.books?.feeds?.filter((f) => f.used && f.status === "live").length ?? "—"}</strong><span>Responding and in use</span></div>
          <div className="desk-metric"><span>Last analysis</span><strong className="!text-lg">{result ? new Date(result.generatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) : "Awaiting run"}</strong><span>{result ? "Eastern time" : "Run the desk to begin"}</span></div>
        </div>
        <div id="desk-content" tabIndex={-1} />
        <SlateRow games={games} loading={slateQuery.isPending && games.length === 0} />

        {busy ? <LoadingBoard stage={stage} /> : null}

        {!busy && !result ? (
          <EmptyBoard
            date={date}
            onAnalyze={() => analyze.mutate()}
            games={games.length}
            log={cardLog}
            grading={gradeQuery.isFetching || ledgerQuery.isFetching}
          />
        ) : null}

        {result && !busy ? (
          <section className={`grid gap-6 ${wide ? "" : "lg:grid-cols-[minmax(0,1fr)_280px]"}`}>
            <div className="min-w-0">
              {result.briefing ? (
                <p className="font-serif mb-5 max-w-3xl text-sm leading-relaxed text-muted italic">{result.briefing}</p>
              ) : null}

              <Tabs value={tab} onValueChange={(v) => setTab(v as DeskTab)}>
                <TabsList>
                  {TABS.map((m) => (
                    <TabsTrigger key={m.id} value={m.id}>
                      {m.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {TABS.filter((m) => m.id !== "savant" && m.id !== "arsenal" && m.id !== "edges" && m.id !== "slips" && m.id !== "grades" && m.id !== "wire" && m.id !== "tape" && m.id !== "books" && m.id !== "sources").map((m) => (
                  <TabsContent key={m.id} value={m.id}>
                    {m.id === "hr" && result.hrDesk ? <HrDeskBanner desk={result.hrDesk} /> : null}
                    {m.id === "k" ? <KDeskBanner picks={result.picks.k} /> : null}
                    {featured && tab === m.id ? (
                      <FeaturedCard pick={featured} onOpen={setSelected} />
                    ) : null}
                    <ol className="enter-stagger panel mt-4 divide-y divide-border overflow-hidden">
                      {(result.picks[m.id as BoardMarket] as Array<BatterPick | PitcherPick>).map((pick, index) => {
                        if (index === 0) return null;
                        return (
                          <li key={`${m.id}-${pick.playerId}-${pick.gamePk}`}>
                            <PickRow pick={pick} onOpen={setSelected} />
                          </li>
                        );
                      })}
                    </ol>
                    {result.picks[m.id as BoardMarket].length === 0 ? (
                      <p className="py-10 text-center text-sm text-muted">No qualified names on this board.</p>
                    ) : null}
                  </TabsContent>
                ))}
                <TabsContent value="slips">
                  <SlipsLab
                    slips={result.slips}
                    lineCount={result.lineCount}
                    grade={result.grade}
                    log={cardLog.filter((e) => e.date !== result.date)}
                    onOpen={(playerId, openMarket) => {
                      if (openMarket === "k") {
                        const pick = findPitcher(result, playerId);
                        if (pick) setSelected(pick);
                        return;
                      }
                      const pick = findBatter(result, playerId);
                      if (pick) setSelected(pick);
                    }}
                  />
                </TabsContent>
                <TabsContent value="grades">
                  <GradesLab log={cardLog} grading={gradeQuery.isFetching || ledgerQuery.isFetching} date={date} games={games.length} />
                </TabsContent>
                <TabsContent value="wire">
                  <WireLab
                    wire={result.wire}
                    onOpen={(playerId, openMarket) => {
                      if (openMarket === "k") {
                        const pick = findPitcher(result, playerId);
                        if (pick) setSelected(pick);
                        return;
                      }
                      const pick = findBatter(result, playerId);
                      if (pick) setSelected(pick);
                    }}
                  />
                </TabsContent>
                <TabsContent value="tape">
                  <TapeLab tape={result.tape} books={result.books} />
                </TabsContent>
                <TabsContent value="books">
                  <BooksLab
                    books={result.books}
                    wire={result.wire}
                    onOpen={(playerId, openMarket) => {
                      if (openMarket === "k") {
                        const pick = findPitcher(result, playerId);
                        if (pick) setSelected(pick);
                        return;
                      }
                      const pick = findBatter(result, playerId);
                      if (pick) setSelected(pick);
                    }}
                  />
                </TabsContent>
                <TabsContent value="sources">
                  <SourcesLab books={result.books} />
                </TabsContent>
                <TabsContent value="edges">
                  <EdgesLab
                    board={result.edges}
                    onOpen={(playerId, edgeMarket) => {
                      if (edgeMarket === "k") {
                        const pick = findPitcher(result, playerId);
                        if (pick) setSelected(pick);
                        return;
                      }
                      const pick = findBatter(result, playerId);
                      if (pick) setSelected(pick);
                    }}
                  />
                </TabsContent>
                <TabsContent value="arsenal">
                  <ArsenalLab
                    board={result.arsenals}
                    onOpen={(playerId) => {
                      const pick = findPitcher(result, playerId);
                      if (pick) setSelected(pick);
                    }}
                  />
                </TabsContent>
                <TabsContent value="savant">
                  <SavantLab
                    board={result.saberBoard}
                    onOpen={(playerId) => {
                      const pick = findBatter(result, playerId);
                      if (pick) setSelected(pick);
                    }}
                  />
                </TabsContent>
              </Tabs>
            </div>

            {wide ? null : (
            <aside className="flex flex-col gap-4">
              <ModelCard result={result} />
              {tab === "savant" ? (
                <GlossaryCard />
              ) : tab === "arsenal" ? (
                <PitchGlossaryCard />
              ) : tab === "edges" ? (
                <EdgeGlossaryCard />
              ) : (
                <HrChart picks={result.picks.hr} />
              )}
            </aside>
            )}
          </section>
        ) : null}
      </div>

      <PlayerSheet pick={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function Header({
  copy,
  date,
  onDate,
  loading,
  onAnalyze,
  gameCount,
  ledger,
}: {
  copy: EditionCopy;
  date: string;
  onDate: (next: string) => void;
  loading: boolean;
  onAnalyze: () => void;
  gameCount: number;
  ledger: string | null;
}) {
  return (
    <header className="flex flex-col gap-4">
      <Nameplate />
      <div className="desk-hero">
        <div><span className="desk-eyebrow">Baseball / Daily intelligence</span><h1>The game behind<br />the numbers.</h1><p>{copy.deck}</p></div>
        <a href="/research" className="text-sm text-pine hover:underline">Open the research desk ↗</a>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-faint tabular-nums">
          {gameCount} game{gameCount === 1 ? "" : "s"} · Eastern · Home run desk
          {ledger ? ` · Ledger ${ledger}` : ""}
        </p>
        <div className="flex w-full flex-col gap-3 sm:max-w-xs sm:flex-row sm:items-center lg:max-w-none lg:justify-end">
          <label className="flex h-12 w-full items-center gap-2 bg-surface px-3 shadow-[var(--shadow-border)] sm:w-44">
            <CalendarDays className="size-4 text-muted" />
            <span className="sr-only">Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => onDate(e.target.value)}
              className="w-full bg-transparent text-sm text-fg outline-none"
              suppressHydrationWarning
            />
          </label>
          <Button size="lg" onClick={onAnalyze} disabled={loading} className="w-full min-w-0 sm:w-auto">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Radar className="size-4" />}
            {loading ? "Analyzing…" : "Run analysis"}
          </Button>
        </div>
      </div>
    </header>
  );
}

function SlateRow({ games, loading }: { games: GameCard[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="panel grid grid-cols-2 gap-px overflow-hidden md:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-none" />
        ))}
      </div>
    );
  }
  if (games.length === 0) {
    return (
      <div className="border-y border-border py-4 text-sm text-muted">
        Off day or no MLB games on this date. Pick another card.
      </div>
    );
  }
  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <p className="kicker">The slate</p>
        <p className="text-xs text-faint tabular-nums">{games.length} parks</p>
      </div>
      <div className="grid grid-cols-2 gap-px bg-border md:grid-cols-3 lg:grid-cols-5">
        {games.map((game) => (
          <article key={game.gamePk} className="bg-surface px-3 py-3">
            <div className="flex items-center justify-between text-[0.65rem] tracking-widest text-faint uppercase">
              <span>{formatGameTime(game.gameDate) || game.dayNight}</span>
              <span className="tabular-nums">{game.parkHrFactor} HR</span>
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <img src={teamLogoUrl(game.away.id)} alt="" className="size-5 object-contain" />
              <span className="text-sm font-medium">{game.away.abbr}</span>
              <span className="text-faint">@</span>
              <img src={teamLogoUrl(game.home.id)} alt="" className="size-5 object-contain" />
              <span className="text-sm font-medium">{game.home.abbr}</span>
            </div>
            <p className="mt-1.5 truncate text-xs text-muted">
              {game.away.probable?.name?.split(" ").slice(-1)[0] ?? "TBD"} vs{" "}
              {game.home.probable?.name?.split(" ").slice(-1)[0] ?? "TBD"}
            </p>
            <p className="mt-1 truncate text-xs text-faint">
              {game.venueName}
              {game.weather ? ` · ${game.weather.windLabel}` : ""}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}

function EmptyBoard({
  date,
  onAnalyze,
  games,
  log,
  grading = false,
}: {
  date: string;
  onAnalyze: () => void;
  games: number;
  log: DeskLogEntry[];
  grading?: boolean;
}) {
  return (
    <div className="flex flex-col gap-8">
      {log.length ? <GradesLab log={log} grading={grading} date={date} games={games} /> : null}
      <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="kicker">Tonight</p>
          <p className="font-serif mt-1 text-sm leading-relaxed text-muted italic">
            {games ? `${games} games on the board. ` : ""}
            The desk posts the Great Run board and the 2/3/6 itself, then grades from the boxes. Fetch is a manual override.
          </p>
        </div>
        <Button size="lg" onClick={onAnalyze} className="shrink-0">
          <Radar className="size-4" />
          Fetch & analyze
        </Button>
      </div>
    </div>
  );
}

function LoadingBoard({ stage }: { stage: number }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="kicker">{LOADING_COPY[stage]}</p>
      <Skeleton className="h-36 w-full rounded-md" />
      <div className="panel divide-y divide-border overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-none" />
        ))}
      </div>
    </div>
  );
}

function HrDeskBanner({ desk }: { desk: NonNullable<AnalysisResult["hrDesk"]> }) {
  if (desk.n <= 0 && desk.pending <= 0) return null;
  return (
    <div className="mb-4 grid grid-cols-2 overflow-hidden bg-paper text-ink">
      <div className="px-5 py-4">
        <p className="text-[0.65rem] font-medium tracking-widest uppercase text-ink/50">Great Run board</p>
        <p className="font-display mt-1 text-4xl leading-none font-extrabold tabular-nums">
          {desk.n > 0 ? `${desk.hits}/${desk.n}` : "Open"}
        </p>
      </div>
      <div className="border-l border-ink/10 px-5 py-4">
        <p className="text-[0.65rem] font-medium tracking-widest uppercase text-ink/50">Expected</p>
        <p className="font-display mt-1 text-4xl leading-none font-extrabold tabular-nums">
          {typeof desk.expected === "number" ? desk.expected.toFixed(1) : "—"}
        </p>
      </div>
      <p className="col-span-2 border-t border-ink/10 px-5 py-3 text-sm text-ink/60">{desk.summary}</p>
    </div>
  );
}

function KDeskBanner({ picks }: { picks: PitcherPick[] }) {
  if (!picks.length) return null;
  const expected = picks.reduce((s, p) => s + (p.impliedK || 0), 0);
  const std = picks.filter((p) => p.propLine?.oddsType === "standard" && p.propLine.side === "over");
  const vsLine = std
    .slice(0, 3)
    .map((p) => `${p.name.split(" ").slice(-1)[0]} ${p.impliedK.toFixed(1)} vs ${p.propLine!.line}`)
    .join(" · ");
  return (
    <div className="mb-4 grid grid-cols-2 overflow-hidden bg-paper text-ink">
      <div className="px-5 py-4">
        <p className="text-[0.65rem] font-medium tracking-widest uppercase text-ink/50">Starters priced</p>
        <p className="font-display mt-1 text-4xl leading-none font-extrabold tabular-nums">{picks.length}</p>
      </div>
      <div className="border-l border-ink/10 px-5 py-4">
        <p className="text-[0.65rem] font-medium tracking-widest uppercase text-ink/50">Board expected Ks</p>
        <p className="font-display mt-1 text-4xl leading-none font-extrabold tabular-nums">{expected.toFixed(1)}</p>
      </div>
      <p className="col-span-2 border-t border-ink/10 px-5 py-3 text-sm text-ink/60">
        {vsLine
          ? `Standard lines: ${vsLine}. Expected Ks are K/BF × tonight's outing, mix whiff, and the lineup's punchout rate.`
          : "PrizePicks is mostly 6.5 demons tonight. Expected Ks still rank who misses bats — a skip on the 2/3/6 is not a missing board."}
      </p>
    </div>
  );
}

function FeaturedCard({ pick, onOpen }: { pick: BatterPick | PitcherPick; onOpen: (pick: BatterPick | PitcherPick) => void }) {
  const batter = pick.market !== "k" ? (pick as BatterPick) : null;
  const kPick = pick.market === "k" ? (pick as PitcherPick) : null;
  const indexLabel =
    pick.market === "hits"
      ? "Hits index"
      : pick.market === "tb"
        ? "TB index"
        : pick.market === "rbi"
          ? "RBI index"
          : pick.market === "sb"
            ? "SB index"
            : pick.market === "k"
              ? "Expected Ks"
              : "HR index";
  return (
    <button
      type="button"
      onClick={() => onOpen(pick)}
      className="relative w-full bg-surface p-5 text-left shadow-[var(--shadow-border)] transition-[box-shadow,transform] duration-150 ease-out hover:shadow-[var(--shadow-border-hover)] active:scale-[0.96] before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-brick"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <img
          src={headshotUrl(pick.playerId)}
          alt=""
          className="size-16 shrink-0 rounded-md bg-elevated object-cover outline outline-1 -outline-offset-1 outline-fg/10"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-4xl leading-none font-semibold tabular-nums text-faint">
              {String(pick.rank).padStart(2, "0")}
            </span>
            <Badge variant={leanVariant(pick.lean)}>{pick.lean}</Badge>
            {batter?.actual && batter.actual.hr > 0 ? <Badge variant="brick">Went yard</Badge> : null}
            {batter?.actual && batter.actual.hr === 0 && batter.gameState === "Final" ? <Badge variant="default">0 HR</Badge> : null}
            {kPick && kPick.actualK != null && kPick.gameState === "Final" ? (
              <Badge variant={kPick.actualK >= 6 ? "brick" : "default"}>{kPick.actualK} K</Badge>
            ) : null}
            {batter?.inLineup ? <Badge variant="pine">{batter.lineupSlot ? `Slot ${batter.lineupSlot}` : "In lineup"}</Badge> : null}
          </div>
          <h2 className="font-display mt-1 text-3xl leading-[1.05] font-semibold tracking-tight">{pick.name}</h2>
          <p className="mt-2 text-sm text-muted">
            {pick.teamAbbr} vs {pick.opponentAbbr}
            {batter?.pitcherName ? ` · ${batter.pitcherName}` : kPick?.hand ? ` · ${kPick.hand}HP` : ""}
          </p>
          <p className="text-sm text-faint">{pick.venueName}</p>
        </div>
        <div className="shrink-0 sm:text-right">
          <p className="text-xs tracking-wider text-faint uppercase">{indexLabel}</p>
          <p className="font-display text-5xl leading-none font-semibold tabular-nums">
            {kPick ? kPick.impliedK.toFixed(1) : pick.score}
          </p>
          {pick.market === "hr" ? (
            <p className="mt-1 text-xs text-muted tabular-nums">
              {(pick.hrPct * 100).toFixed(0)}% to go yard
            </p>
          ) : kPick ? (
            <p className="mt-1 text-xs text-muted tabular-nums">
              {kPick.kRate > 0 ? `${(kPick.kRate * 100).toFixed(0)}% K/BF` : `${kPick.pitcher.k9.toFixed(1)} K/9`}
              {kPick.pitcher.recentK9 != null ? ` · last ${kPick.pitcher.recentK9.toFixed(1)}` : ""}
            </p>
          ) : null}
          {pick.propLine ? (
            <p className="mt-1 text-xs text-faint">
              PP {pick.propLine.side === "over" ? "Over" : "Under"} {pick.propLine.line} {pick.propLine.stat}
              {pick.propLine.oddsType !== "standard" ? ` · ${pick.propLine.oddsType}` : ""}
            </p>
          ) : null}
        </div>
      </div>
      {batter?.market === "sb" && batter.edge ? (
        <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MiniStat label="Sprint" value={fmt1(batter.edge.sprint)} />
          <MiniStat label="HP to 1B" value={batter.edge.hpTo1b != null ? `${batter.edge.hpTo1b.toFixed(2)}s` : "—"} />
          <MiniStat
            label="Pitcher SB"
            value={batter.edge.pitcherSbRate != null ? `${(batter.edge.pitcherSbRate * 100).toFixed(1)}%` : "—"}
          />
          <MiniStat
            label="Catcher CS"
            value={batter.edge.catcherCs != null ? `${(batter.edge.catcherCs * 100).toFixed(0)}%` : "—"}
          />
        </dl>
      ) : batter?.market === "hits" && batter.saber ? (
        <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MiniStat label="xBA" value={fmt3(batter.saber.xba)} />
          <MiniStat label="AVG" value={batter.season.avg.toFixed(3)} />
          <MiniStat label="xwOBA" value={fmt3(batter.saber.xwoba)} />
          <MiniStat label="Luck" value={luckLabel(luckDelta(batter.season.avg, batter.saber.xba))} tone={luckTone(luckDelta(batter.season.avg, batter.saber.xba))} />
        </dl>
      ) : batter?.saber ? (
        <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MiniStat label="Brl/PA" value={fmt1(batter.saber.barrelPa, "%")} />
          <MiniStat label="Hard hit" value={fmt1(batter.saber.hardHit, "%")} />
          <MiniStat label="Launch" value={batter.saber.launch != null ? `${batter.saber.launch.toFixed(1)}°` : "—"} />
          <MiniStat label="xSLG" value={fmt3(batter.saber.xslg)} />
        </dl>
      ) : kPick ? (
        <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MiniStat label="K/9" value={kPick.pitcher.k9.toFixed(1)} />
          <MiniStat label="Opp K%" value={`${(kPick.oppKRate * 100).toFixed(1)}%`} />
          <MiniStat label="Park K" value={String(kPick.parkKFactor)} />
          <MiniStat label="WHIP" value={kPick.pitcher.whip.toFixed(2)} />
        </dl>
      ) : null}
      {batter?.matchup ? (
        <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted">
          <span className={`inline-block size-2 rounded-full ${familyFill(batter.matchup.family)}`} />
          {batter.pitcherName ? `${batter.pitcherName.split(" ").slice(-1)[0]} ` : ""}
          {batter.matchup.code} {batter.matchup.usage.toFixed(0)}%
          {batter.matchup.batterXslg != null ? ` · ${batter.matchup.batterXslg.toFixed(3)} xSLG vs it` : ""}
        </p>
      ) : null}
      {batter?.edge ? <EdgeChips edge={batter.edge} isHome={batter.isHome} /> : null}
      <ul className="mt-4 grid gap-2 sm:grid-cols-3">
        {pick.reasons.map((reason) => (
          <li key={reason} className="rounded-md bg-elevated px-3 py-2 text-xs text-muted">
            {reason}
          </li>
        ))}
      </ul>
      {pick.note ? <p className="mt-3 text-sm text-fg">{pick.note}</p> : null}
    </button>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "pine" | "brick" | "default";
}) {
  const color = tone === "pine" ? "text-pine" : tone === "brick" ? "text-brick" : "text-fg";
  return (
    <div className="rounded-md bg-elevated px-3 py-2">
      <dt className="text-xs tracking-wider text-faint uppercase">{label}</dt>
      <dd className={`font-display text-lg font-semibold tabular-nums ${color}`}>{value}</dd>
    </div>
  );
}

function PickRow({
  pick,
  onOpen,
}: {
  pick: BatterPick | PitcherPick;
  onOpen: (pick: BatterPick | PitcherPick) => void;
}) {
  const batter = pick.market !== "k" ? (pick as BatterPick) : null;
  const wentYard = batter?.market === "hr" && (batter.actual?.hr ?? 0) > 0;
  const missedHr = batter?.market === "hr" && batter.gameState === "Final" && batter.actual && batter.actual.hr === 0;
  return (
    <button
      type="button"
      onClick={() => onOpen(pick)}
      className="flex w-full items-center gap-3 px-3 py-3 text-left transition-[background-color,transform] duration-150 ease-out hover:bg-elevated active:scale-[0.96]"
    >
      <span className="font-display w-8 shrink-0 text-lg text-faint tabular-nums">
        {String(pick.rank).padStart(2, "0")}
      </span>
      <img
        src={headshotUrl(pick.playerId)}
        alt=""
        className="size-10 shrink-0 rounded-sm bg-elevated object-cover outline outline-1 -outline-offset-1 outline-fg/10"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{pick.name}</span>
        <span className="block truncate text-xs text-muted">
          {pick.teamAbbr} vs {pick.opponentAbbr}
          {"pitcherName" in pick && pick.pitcherName ? ` · ${pick.pitcherName}` : ""}
        </span>
      </span>
      {wentYard ? <Badge variant="brick">Yard</Badge> : missedHr ? <Badge variant="default">0 HR</Badge> : <Badge variant={leanVariant(pick.lean)}>{pick.lean}</Badge>}
      <span className="font-display w-10 shrink-0 text-right text-2xl font-semibold tabular-nums">{pick.market === "k" ? (pick as PitcherPick).impliedK.toFixed(1) : pick.score}</span>
      <span className="hidden w-16 shrink-0 text-right text-xs text-faint sm:block">
        {batter?.market === "hr" ? `${(batter.hrPct * 100).toFixed(0)}%` : trailStat(pick)}
      </span>
    </button>
  );
}

function ModelCard({ result }: { result: AnalysisResult }) {
  return (
    <Card>
      <div className="flex items-center gap-2">
        <Gauge className="size-3.5 text-stone" />
        <p className="kicker">Model</p>
      </div>
      <p className="font-display mt-2 text-xl font-semibold">
        {result.model.name} {result.model.version}
      </p>
      <ul className="mt-3 flex flex-col gap-2 text-xs leading-relaxed text-muted">
        {result.model.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
      <Separator className="my-3" />
      <p className="text-xs text-faint">{result.sources.join(" · ")}</p>
    </Card>
  );
}

function HrChart({ picks }: { picks: BatterPick[] }) {
  const max = Math.max(...picks.map((p) => p.hrPct || p.score / 100), 0.01);
  return (
    <Card className="p-4">
      <p className="kicker">P(HR) tonight</p>
      <ul className="mt-3 flex flex-col gap-2">
        {picks.map((pick) => (
          <li key={pick.playerId} className="grid grid-cols-[72px_minmax(0,1fr)_36px] items-center gap-2">
            <span className="truncate text-xs text-muted">{pick.name.split(" ").slice(-1)[0]}</span>
            <span className="h-1.5 overflow-hidden rounded-full bg-elevated">
              <span className="block h-full rounded-full bg-brick" style={{ width: `${(pick.hrPct / max) * 100}%` }} />
            </span>
            <span className="text-right text-xs tabular-nums">{(pick.hrPct * 100).toFixed(0)}%</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function GlossaryCard() {
  return (
    <Card className="p-4">
      <p className="kicker">Savant glossary</p>
      <ul className="mt-3 flex flex-col gap-3">
        {SABER_GLOSSARY.slice(0, 6).map((term) => (
          <li key={term.key}>
            <p className="text-xs font-medium tracking-wide uppercase">{term.label}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">{term.blurb}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function SavantLab({
  board,
  onOpen,
}: {
  board: SaberRow[];
  onOpen: (playerId: number) => void;
}) {
  const [sort, setSort] = useState<SortKey>("barrelPa");

  const ranked = useMemo(() => {
    const copy = [...board];
    copy.sort((a, b) => {
      const av = saberValue(a, sort);
      const bv = saberValue(b, sort);
      return sort === "luckSlg" ? av - bv : bv - av;
    });
    return copy;
  }, [board, sort]);

  const loud = useMemo(() => {
    return [...board]
      .sort((a, b) => (b.saber.barrelPa ?? 0) - (a.saber.barrelPa ?? 0))
      .slice(0, 3);
  }, [board]);

  const dueCount = board.filter((row) => {
    const d = luckDelta(row.slg, row.saber.xslg);
    return d != null && d <= -0.02;
  }).length;

  if (board.length === 0) {
    return (
      <Card className="px-5 py-10 text-center text-sm text-muted">
        No Statcast rows on this slate. Run the desk again after the feed settles.
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="kicker">Expected contact</p>
          <h2 className="font-display mt-1 text-4xl font-semibold tracking-tight">Savant lab</h2>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Expected stats and barrels for tonight's bats. Sort the board, then open a name for the full card.
            {dueCount ? ` ${dueCount} hitters are running behind their xSLG.` : ""}
          </p>
        </div>
      </div>

      <div className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {SORTS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSort(s.id)}
            className={`h-9 shrink-0 rounded-md px-3 text-xs font-medium tracking-wider uppercase ${
              sort === s.id ? "bg-elevated text-fg shadow-[var(--shadow-border)]" : "text-muted"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {loud.map((row, i) => (
          <button
            key={row.playerId}
            type="button"
            onClick={() => onOpen(row.playerId)}
            className="panel p-4 text-left transition-[box-shadow] duration-150 hover:shadow-[var(--shadow-border-hover)]"
          >
            <p className="text-xs tracking-widest text-faint uppercase">Loud contact {String(i + 1).padStart(2, "0")}</p>
            <p className="font-display mt-2 truncate text-2xl font-semibold">{row.name}</p>
            <p className="text-xs text-muted">
              {row.teamAbbr} vs {row.opponentAbbr}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-2">
              <MiniStat label="Brl/PA" value={fmt1(row.saber.barrelPa, "%")} />
              <MiniStat label="xSLG" value={fmt3(row.saber.xslg)} />
            </dl>
          </button>
        ))}
      </div>

      <ol className="panel divide-y divide-border overflow-hidden">
        {ranked.map((row, index) => {
          const d = luckDelta(row.slg, row.saber.xslg);
          return (
            <li key={row.playerId}>
              <button
                type="button"
                onClick={() => onOpen(row.playerId)}
                className="flex w-full items-center gap-3 px-3 py-3 text-left transition-[background-color] duration-150 hover:bg-elevated"
              >
                <span className="font-display w-8 shrink-0 text-lg text-faint tabular-nums">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <img
                  src={headshotUrl(row.playerId)}
                  alt=""
                  className="size-10 shrink-0 rounded-sm bg-elevated object-cover outline outline-1 -outline-offset-1 outline-fg/10"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{row.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {row.teamAbbr} vs {row.opponentAbbr}
                    {row.pitcherName ? ` · ${row.pitcherName}` : ""}
                  </span>
                </span>
                <span className="hidden text-right sm:grid sm:grid-cols-3 sm:gap-4">
                  <span className="block">
                    <span className="block text-xs tracking-wider text-faint uppercase">Brl/PA</span>
                    <span className="font-display text-lg font-semibold tabular-nums">{fmt1(row.saber.barrelPa)}</span>
                  </span>
                  <span className="block">
                    <span className="block text-xs tracking-wider text-faint uppercase">xSLG</span>
                    <span className="font-display text-lg font-semibold tabular-nums">{fmt3(row.saber.xslg)}</span>
                  </span>
                  <span className="block">
                    <span className="block text-xs tracking-wider text-faint uppercase">Luck</span>
                    <span
                      className={`font-display text-lg font-semibold tabular-nums ${
                        luckTone(d) === "pine" ? "text-pine" : luckTone(d) === "brick" ? "text-brick" : ""
                      }`}
                    >
                      {d == null ? "—" : `${d >= 0 ? "+" : ""}${d.toFixed(3)}`}
                    </span>
                  </span>
                </span>
                <span className="font-display w-10 shrink-0 text-right text-2xl font-semibold tabular-nums sm:hidden">
                  {fmt1(row.saber.barrelPa)}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <section className="panel p-5 lg:hidden">
        <p className="kicker">Glossary</p>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {SABER_GLOSSARY.map((term) => (
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

function PlayerSheet({
  pick,
  onClose,
}: {
  pick: BatterPick | PitcherPick | null;
  onClose: () => void;
}) {
  const batter = pick && pick.market !== "k" ? (pick as BatterPick) : null;
  const pitcher = pick && pick.market === "k" ? (pick as PitcherPick) : null;
  const slgLuck = batter ? luckDelta(batter.season.slg, batter.saber?.xslg) : null;
  const avgLuck = batter ? luckDelta(batter.season.avg, batter.saber?.xba) : null;

  return (
    <Sheet open={!!pick} onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        {pick ? (
          <>
            <SheetHeader>
              <p className="text-xs tracking-widest text-stone uppercase">
                {pick.teamAbbr} · {pick.rank ? `rank ${pick.rank}` : "Savant"}
              </p>
              <SheetTitle>{pick.name}</SheetTitle>
              <SheetDescription>
                {pick.venueName} · vs {pick.opponentAbbr}
              </SheetDescription>
            </SheetHeader>
            <div className="px-5 py-5">
              <div className="flex items-center gap-4">
                <img
                  src={headshotUrl(pick.playerId)}
                  alt=""
                  className="size-20 rounded-lg bg-elevated object-cover outline outline-1 -outline-offset-1 outline-fg/10"
                />
                <div>
                  <p className="text-xs tracking-wider text-faint uppercase">Index</p>
                  <p className="font-display text-5xl leading-none font-semibold tabular-nums">{pick.score}</p>
                  <Badge className="mt-2" variant={leanVariant(pick.lean)}>
                    {pick.lean}
                  </Badge>
                  {pick.propLine ? (
                    <p className="mt-2 text-xs text-muted">
                      PrizePicks {pick.propLine.side === "over" ? "over" : "under"} {pick.propLine.line}{" "}
                      {pick.propLine.stat}
                      {pick.propLine.oddsType !== "standard" ? ` · ${pick.propLine.oddsType}` : ""}
                    </p>
                  ) : null}
                </div>
              </div>

              {batter ? (
                <dl className="mt-6 grid grid-cols-3 gap-2">
                  <Stat label="HR" value={String(batter.season.hr)} />
                  <Stat label="ISO" value={batter.season.iso.toFixed(3)} />
                  <Stat label="AVG" value={batter.season.avg.toFixed(3)} />
                  <Stat label="SLG" value={batter.season.slg.toFixed(3)} />
                  <Stat label="RBI" value={String(batter.season.rbi)} />
                  <Stat label="R" value={String(batter.season.runs ?? 0)} />
                  <Stat label="SB" value={String(batter.season.sb)} />
                </dl>
              ) : null}

              {batter?.saber ? <StatcastBlock saber={batter.saber} slgLuck={slgLuck} avgLuck={avgLuck} /> : null}

              {batter?.vsPitches?.length ? (
                <div className="mt-6">
                  <h4 className="text-xs tracking-widest text-stone uppercase">Vs pitch types</h4>
                  {batter.matchup ? (
                    <p className="mt-2 text-sm text-muted">
                      Tonight's primary is {batter.matchup.code} ({batter.matchup.usage.toFixed(0)}%
                      {batter.pitcherName ? ` from ${batter.pitcherName.split(" ").slice(-1)[0]}` : ""}).
                      {batter.matchup.batterXslg != null
                        ? ` This bat is at ${batter.matchup.batterXslg.toFixed(3)} xSLG against it.`
                        : ""}
                    </p>
                  ) : null}
                  <PitchTable pitches={batter.vsPitches} invertRv />
                </div>
              ) : null}

              {batter?.edge ? <EdgeContext edge={batter.edge} isHome={batter.isHome} /> : null}

              {pitcher ? (
                <dl className="mt-6 grid grid-cols-3 gap-2">
                  <Stat label="Expected K" value={pitcher.impliedK > 0 ? pitcher.impliedK.toFixed(1) : "—"} />
                  <Stat label="K/BF" value={pitcher.kRate > 0 ? `${(pitcher.kRate * 100).toFixed(1)}%` : "—"} />
                  <Stat label="K/9" value={pitcher.pitcher.k9.toFixed(1)} />
                  <Stat
                    label="xERA"
                    value={pitcher.pitcher.xera != null ? pitcher.pitcher.xera.toFixed(2) : "—"}
                  />
                  <Stat label="ERA" value={pitcher.pitcher.era.toFixed(2)} />
                  <Stat label="HR/9" value={pitcher.pitcher.hr9.toFixed(2)} />
                  <Stat label="WHIP" value={pitcher.pitcher.whip.toFixed(2)} />
                  <Stat label="Opp K%" value={`${(pitcher.oppKRate * 100).toFixed(1)}%`} />
                  <Stat
                    label="Last 10"
                    value={pitcher.pitcher.recentK9 != null ? `${pitcher.pitcher.recentK9.toFixed(1)} K/9` : "—"}
                  />
                </dl>
              ) : null}

              {pitcher?.pitcher.arsenal.length ? (
                <div className="mt-6">
                  <h4 className="text-xs tracking-widest text-stone uppercase">Arsenal</h4>
                  <div className="mt-3">
                    <MixBar pitches={pitcher.pitcher.arsenal} />
                  </div>
                  <PitchTable pitches={pitcher.pitcher.arsenal} />
                </div>
              ) : null}

              {pick.factors.length ? (
                <>
                  <h4 className="mt-6 text-xs tracking-widest text-stone uppercase">Factors</h4>
                  <ul className="mt-3 flex flex-col gap-3">
                    {pick.factors.map((factor) => (
                      <li key={factor.key}>
                        <div className="flex items-baseline justify-between text-xs">
                          <span>{factor.label}</span>
                          <span className="text-muted">{factor.detail}</span>
                        </div>
                        <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-elevated">
                          <span
                            className="block h-full rounded-full bg-accent"
                            style={{ width: `${Math.round(factor.score * 100)}%` }}
                          />
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              {batter?.recent ? (
                <p className="mt-5 text-sm text-muted">
                  Last 10: {batter.recent.hr} HR, {batter.recent.hits} H, {batter.recent.avg.toFixed(3)} AVG
                </p>
              ) : null}

              {batter?.weather ? (
                <p className="mt-2 flex items-center gap-2 text-sm text-muted">
                  <CloudSun className="size-4" />
                  {batter.weather.tempF != null ? `${Math.round(batter.weather.tempF)}°` : "—"}
                  <Wind className="size-4" />
                  {batter.weather.windLabel}
                </p>
              ) : null}

              {batter?.note || pitcher?.note ? (
                <p className="mt-5 text-sm leading-relaxed">{batter?.note ?? pitcher?.note}</p>
              ) : null}

              <p className="mt-8 text-xs text-faint">
                Model output for research. Not a guarantee of results. Confirm lineups and injuries before using a card.
              </p>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function StatcastBlock({
  saber,
  slgLuck,
  avgLuck,
}: {
  saber: SaberCard;
  slgLuck: number | null;
  avgLuck: number | null;
}) {
  return (
    <div className="mt-6">
      <h4 className="text-xs tracking-widest text-stone uppercase">Statcast</h4>
      <dl className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="xBA" value={fmt3(saber.xba)} />
        <Stat label="xSLG" value={fmt3(saber.xslg)} />
        <Stat label="xwOBA" value={fmt3(saber.xwoba)} />
        <Stat label="Brl/PA" value={fmt1(saber.barrelPa, "%")} />
        <Stat label="Hard hit" value={fmt1(saber.hardHit, "%")} />
        <Stat label="Launch" value={saber.launch != null ? `${saber.launch.toFixed(1)}°` : "—"} />
        <Stat label="Sweet" value={fmt1(saber.sweetSpot, "%")} />
        <Stat label="Avg EV" value={fmt1(saber.evAvg)} />
        <Stat label="Max EV" value={fmt1(saber.evMax)} />
        <Stat label="wRC+" value={fmt0(saber.wrcPlus)} />
        <Stat label="WAR" value={fmt1(saber.war)} />
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge variant={luckTone(slgLuck)}>{`SLG luck ${luckLabel(slgLuck)}`}</Badge>
        <Badge variant={luckTone(avgLuck)}>{`AVG luck ${luckLabel(avgLuck)}`}</Badge>
      </div>
      {slgLuck != null && Math.abs(slgLuck) >= 0.02 ? (
        <p className="mt-3 text-sm text-muted">
          {slgLuck < 0
            ? `SLG sits ${Math.abs(slgLuck).toFixed(3)} below xSLG — contact has been unlucky.`
            : `SLG sits ${slgLuck.toFixed(3)} above xSLG — some of the extra bags may regress.`}
        </p>
      ) : null}
    </div>
  );
}

function EdgeChips({ edge, isHome }: { edge: PropEdge; isHome: boolean }) {
  const chips: string[] = [];
  if (edge.vsHand && edge.vsHand.pa >= 25) {
    chips.push(`${edge.vsHand.slg.toFixed(3)} SLG vs ${edge.vsHandCode === "vl" ? "LHP" : "RHP"}`);
  }
  if (edge.fbRate != null && edge.pullRate != null) chips.push(`${edge.fbRate.toFixed(0)}% FB · ${edge.pullRate.toFixed(0)}% pull`);
  else if (edge.fbRate != null) chips.push(`${edge.fbRate.toFixed(0)}% FB`);
  if (edge.sprint != null && edge.sprint >= 28) chips.push(`${edge.sprint.toFixed(1)} ft/s`);
  if (edge.ha && edge.ha.pa >= 30) chips.push(`${edge.ha.ops.toFixed(3)} OPS ${isHome ? "home" : "away"}`);
  if (!chips.length) return null;
  return (
    <p className="mt-2 flex flex-wrap gap-2 text-xs text-faint">
      {chips.map((chip) => (
        <span key={chip} className="rounded-full bg-elevated px-2 py-1">
          {chip}
        </span>
      ))}
    </p>
  );
}

function EdgeContext({ edge, isHome }: { edge: PropEdge; isHome: boolean }) {
  const catcher = edge.catcherName ? edge.catcherName.split(",")[0].trim() : null;
  return (
    <div className="mt-6">
      <h4 className="text-xs tracking-widest text-stone uppercase">Context</h4>
      <dl className="mt-3 grid grid-cols-3 gap-2">
        <Stat
          label={edge.vsHandCode === "vl" ? "vs LHP" : edge.vsHandCode === "vr" ? "vs RHP" : "Platoon"}
          value={edge.vsHand ? edge.vsHand.slg.toFixed(3) : "—"}
        />
        <Stat label={isHome ? "Home OPS" : "Away OPS"} value={edge.ha ? edge.ha.ops.toFixed(3) : "—"} />
        <Stat label="Fly ball" value={edge.fbRate != null ? `${edge.fbRate.toFixed(0)}%` : "—"} />
        <Stat label="Pull" value={edge.pullRate != null ? `${edge.pullRate.toFixed(0)}%` : "—"} />
        <Stat label="Sprint" value={edge.sprint != null ? edge.sprint.toFixed(1) : "—"} />
        <Stat label="HP to 1B" value={edge.hpTo1b != null ? `${edge.hpTo1b.toFixed(2)}s` : "—"} />
        <Stat
          label="Pitcher SB"
          value={edge.pitcherSbRate != null ? `${(edge.pitcherSbRate * 100).toFixed(1)}%` : "—"}
        />
        <Stat
          label={catcher ? catcher : "Catcher CS"}
          value={edge.catcherCs != null ? `${(edge.catcherCs * 100).toFixed(0)}%` : edge.catcherPop != null ? `${edge.catcherPop.toFixed(2)}s` : "—"}
        />
        <Stat label="Team OBP" value={edge.teamObp != null ? edge.teamObp.toFixed(3) : "—"} />
      </dl>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-elevated px-3 py-2">
      <dt className="text-xs tracking-wider text-faint uppercase">{label}</dt>
      <dd className="font-display text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
