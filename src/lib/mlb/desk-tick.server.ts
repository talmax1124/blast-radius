import { fetchSlate, runAnalysis } from "./engine.server";
import { savePublishedCard, syncLedgerWindow, type LedgerDay } from "./ledger.server";
import { todayEt } from "./parse";
import { loadPrizePicks } from "./prizepicks.server";
import { entryPending } from "./recap";
import type { AnalysisResult, BatterPick, DeskTick, GameCard, PitcherPick, SlipCard } from "./types";
import { buildWire, snapshotQuotes } from "./wire.server";
import { loadBooksBoard } from "./books.server";
import { attachBooks, countLeaks } from "./odds";
import { snapshotOdds } from "./tape.server";

let inflight: Promise<DeskTick> | null = null;

function cardLocked(day: LedgerDay | undefined, games: GameCard[]): boolean {
  const posted = (day?.slips ?? []).filter((s) => !s.skip && s.legs.length > 0);
  if (!posted.length) return false;
  if (day?.complete) return true;
  if (posted.some((s) => s.legs.some((l) => l.result === "hit" || l.result === "miss"))) return true;
  return games.some((g) => g.abstractState !== "Preview");
}

function pendingCount(ledger: LedgerDay[]): number {
  return ledger.filter((d) => entryPending(d)).length;
}

function gradeSnap(day: LedgerDay | undefined): DeskTick["grade"] {
  if (!day?.grade || day.grade.n + day.grade.dnp <= 0) return null;
  return { hits: day.grade.hits, n: day.grade.n };
}

function analysisOf(day: LedgerDay | undefined): AnalysisResult | null {
  const raw = day?.analysis;
  if (!raw?.picks?.hr || !Array.isArray(raw.slips)) return null;
  if (!day) return raw;
  return { ...raw, slips: day.slips, grade: day.grade };
}

function metaOf(games: GameCard[]) {
  const finals = games.filter((g) => g.abstractState === "Final").length;
  const live = games.filter((g) => g.abstractState === "Live").length;
  return {
    finals,
    live,
    games: games.length,
    complete: games.length > 0 && finals === games.length,
  };
}

function pack(
  date: string,
  action: DeskTick["action"],
  note: string,
  ledger: LedgerDay[],
  result: AnalysisResult | null,
): DeskTick {
  const day = ledger.find((d) => d.date === date);
  const slips = (result?.slips ?? day?.slips ?? []) as SlipCard[];
  return {
    date,
    action,
    note,
    slips: slips.length,
    pending: pendingCount(ledger),
    games: result?.games.length ?? day?.games ?? 0,
    finals: day?.finals ?? 0,
    complete: Boolean(day?.complete),
    grade: gradeSnap(day),
    result: result ?? analysisOf(day),
  };
}

async function tickOnce(date: string): Promise<DeskTick> {
  let ledger = await syncLedgerWindow(date);
  let day = ledger.find((d) => d.date === date);
  let slateGames: GameCard[] = [];
  try {
    slateGames = (await fetchSlate(date)).games;
  } catch {
    slateGames = [];
  }

  if (!slateGames.length) {
    return pack(date, "off", "Off day. Open cards still grade from the boxes.", ledger, analysisOf(day));
  }

  const started = slateGames.some((g) => g.abstractState !== "Preview");
  try {
    const lines = await loadPrizePicks(date);
    const quotes = await snapshotQuotes(date, lines, started);
    const current = analysisOf(day);
    if (current) {
      const picks = [
        ...current.picks.hr,
        ...current.picks.hits,
        ...current.picks.tb,
        ...current.picks.rbi,
        ...current.picks.sb,
        ...current.picks.k,
      ] as Array<BatterPick | PitcherPick>;
      current.wire = buildWire({ picks, slips: current.slips, quotes, news: current.books?.news });
      try {
        const books = await loadBooksBoard(date);
        current.wire = buildWire({ picks, slips: current.slips, quotes, news: books.news });
        current.wire.rows = attachBooks(current.wire.rows, books.props);
        current.books = { ...books, leaks: countLeaks(current.wire.rows) };
        current.tape = await snapshotOdds(date, books, slateGames);
      } catch {
        /* books are optional on a locked tick */
      }
    } else {
      try {
        const books = await loadBooksBoard(date);
        await snapshotOdds(date, books, slateGames);
      } catch {
        /* tape is best-effort */
      }
    }
    if (cardLocked(day, slateGames)) {
      if (current) {
        try {
          await savePublishedCard({
            date: current.date,
            version: current.model.version,
            slips: current.slips,
            grade: current.grade,
            analysis: current,
            ...metaOf(slateGames),
          });
        } catch {
          /* keep grading even if the tape save misses */
        }
      }
      return pack(
        date,
        day?.complete ? "graded" : "locked",
        day?.complete
          ? "Card is Final. The book scored it from the boxes. The tape froze the close."
          : "First pitch is in. Tonight's 2/3/6 is locked; the tape still snaps CLV.",
        ledger,
        current,
      );
    }
  } catch {
    if (cardLocked(day, slateGames)) {
      return pack(
        date,
        day?.complete ? "graded" : "locked",
        day?.complete
          ? "Card is Final. The book scored it from the boxes."
          : "First pitch is in. Tonight's 2/3/6 is locked; boxes still grade.",
        ledger,
        analysisOf(day),
      );
    }
  }

  const had = Boolean(day?.slips.length);
  try {
    const result = await runAnalysis(date);
    const meta = metaOf(result.games);
    const postedN = result.slips.filter((s) => !s.skip && s.legs.length > 0).length;
    const skip =
      postedN === 0
        ? { hits: 0, n: 0, dnp: 0, summary: "No card posted. Skip — not a loss." }
        : result.grade;
    await savePublishedCard({
      date: result.date,
      version: result.model.version,
      slips: result.slips,
      grade: skip,
      analysis: { ...result, grade: skip },
      ...meta,
    });
    ledger = await syncLedgerWindow(date);
    const action = postedN === 0 ? "skipped" : had ? "refreshed" : "published";
    return pack(
      date,
      action,
      postedN
        ? had
          ? "Great Run refreshed the card against live lineups and PrizePicks."
          : "Great Run posted the 2/3/6."
        : "No slip cleared the 3.1 floor. Skip — not a loss.",
      ledger,
      result,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed";
    return pack(date, "error", message, ledger, analysisOf(day));
  }
}

export async function runDeskTick(date = todayEt()): Promise<DeskTick> {
  if (inflight) return inflight;
  inflight = tickOnce(date).finally(() => {
    inflight = null;
  });
  return inflight;
}
