import { createServerFn } from "@tanstack/react-start";
import { buildResearchReport } from "./engine.server";
import { dailyHistory, readDailyPayload } from "./store.server";
import { easternClock } from "./schedule";
import type { ResearchReport } from "./types";
import type { NflBoard } from "@/lib/nfl/types";
import type { NhlBoard } from "@/lib/nhl/types";
import type { SlateBoard } from "@/lib/board/slate";
import type { TennisMatch } from "@/lib/board/types";
import type { DeskTick } from "@/lib/mlb/types";

let cachedReport: { expires: number; promise: Promise<ResearchReport> } | undefined;
function liveReport() {
  if (!cachedReport || cachedReport.expires < Date.now()) {
    cachedReport = { expires: Date.now() + 10 * 60_000, promise: buildResearchReport() };
  }
  return cachedReport.promise;
}

export const loadResearch = createServerFn({ method: "GET" }).handler(async () => {
  const date = easternClock().date;
  const [published, history] = await Promise.all([
    readDailyPayload<ResearchReport>(date, "research"),
    dailyHistory(),
  ]);
  return {
    report: published ?? (await liveReport()),
    history,
    published: Boolean(published),
    scheduleReady: Boolean(process.env.CRON_SECRET?.trim() && process.env.DATABASE_URL?.trim()),
    modelConfigured: Boolean(process.env.XAI_API_KEY && process.env.RESEARCH_MODEL),
    date,
  };
});

export const loadPublishedBoards = createServerFn({ method: "GET" }).handler(async () => {
  const date = easternClock().date;
  const [mlb, nfl, nhl, board] = await Promise.all([
    readDailyPayload<DeskTick>(date, "mlb"),
    readDailyPayload<NflBoard>(date, "nfl"),
    readDailyPayload<NhlBoard>(date, "nhl"),
    readDailyPayload<{ slate: SlateBoard; tennis: TennisMatch[] }>(date, "board"),
  ]);
  return { date, mlb: mlb?.result ?? null, nfl, nhl, board };
});
