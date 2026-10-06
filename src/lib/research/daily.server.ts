import { buildSlips, mlbLegs, nflLegs, nhlLegs, tennisLegs } from "@/lib/board/compose";
import { loadSlate } from "@/lib/board/slate.server";
import { loadTennis } from "@/lib/board/tennis.server";
import type { DeskTick } from "@/lib/mlb/types";
import type { NflBoard } from "@/lib/nfl/types";
import type { NhlBoard } from "@/lib/nhl/types";
import { runDeskTick } from "@/lib/mlb/desk-tick.server";
import { buildNflBoard } from "@/lib/nfl/engine.server";
import { buildNhlBoard } from "@/lib/nhl/engine.server";
import { buildResearchReport } from "./engine.server";
import { publishDailyTask, readDailyPayload } from "./store.server";
import { easternClock } from "./schedule";

export async function runDailyEdition(now = new Date()) {
  const { date } = easternClock(now);
  const tasks = await Promise.all([
    publishDailyTask(date, "mlb", async () => {
      const tick = await runDeskTick(date);
      if (tick.action === "error") throw new Error(tick.note);
      return tick;
    }),
    publishDailyTask(date, "nfl", async () => {
      const board = await buildNflBoard(date);
      if (board.games.length && !board.goalLine.length && !board.props.length)
        throw new Error("NFL projections unavailable");
      return board;
    }),
    publishDailyTask(date, "nhl", async () => {
      // Pin the requested Eastern date even when manually retrying after 23:00.
      const board = await buildNhlBoard(new Date(`${date}T16:00:00Z`));
      if (board.games.length && !board.skaters.length)
        throw new Error("NHL projections unavailable");
      return board;
    }),
    publishDailyTask(date, "research", async () => {
      const report = await buildResearchReport(true);
      if (report.feeds.some((feed) => feed.status === "error"))
        throw new Error("Research feed unavailable");
      return report;
    }),
  ]);
  const board = await publishDailyTask(date, "board", async () => {
    const [mlb, nfl, nhl, slate, tennis] = await Promise.all([
      readDailyPayload<DeskTick>(date, "mlb"),
      readDailyPayload<NflBoard>(date, "nfl"),
      readDailyPayload<NhlBoard>(date, "nhl"),
      loadSlate(now),
      loadTennis(),
    ]);
    if (!mlb || !nfl || !nhl)
      throw new Error("Sport editions must finish before the combined board");
    const legs = [
      ...mlbLegs(date, mlb.result?.slips ?? []),
      ...nflLegs(nfl),
      ...nhlLegs(nhl),
      ...slate.legs.filter((leg) => leg.sport !== "mlb"),
      ...tennisLegs(date, tennis),
    ];
    const facets = ["all", ...new Set(legs.map((leg) => leg.sport))] as const;
    const slips = facets.flatMap((facet) =>
      buildSlips(facet === "all" ? legs : legs.filter((leg) => leg.sport === facet), facet),
    );
    return { date, generatedAt: new Date().toISOString(), slate, tennis, slips };
  });
  tasks.push(board);
  return {
    date,
    tasks,
    ok: tasks.every((t) => t.status === "published" || t.status === "already-published"),
  };
}
