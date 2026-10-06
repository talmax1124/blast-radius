import { feed } from "./workbench.server";
import {
  list,
  normalizeGame,
  normalizeSummary,
  SPORT_PATHS,
  type ResearchSport,
} from "./workbench";
import { easternClock } from "./schedule";
import type { Article } from "./types";

/** Bounded source context for the authenticated morning job, never a live paid page load. */
export async function buildMatchupContext() {
  const date = easternClock().date;
  const warnings: string[] = [];
  const context: Article[] = [];
  for (const sport of Object.keys(SPORT_PATHS) as ResearchSport[]) {
    try {
      const base = `https://site.api.espn.com/apis/site/v2/sports/${SPORT_PATHS[sport]}`;
      const schedule = await feed(`${base}/scoreboard?dates=${date.replaceAll("-", "")}&limit=100`);
      if (!Array.isArray(schedule.events)) throw new Error("Missing schedule");
      const games = list(schedule.events).map(normalizeGame);
      if (games.length > 6)
        warnings.push(
          `${sport.toUpperCase()}: context limited to the first 6 of ${games.length} games.`,
        );
      const results = await Promise.allSettled(
        games.slice(0, 6).map(async (game) => {
          const raw = await feed(`${base}/summary?event=${game.id}`);
          if (!raw.header?.id) throw new Error("Missing game details");
          const detail = normalizeSummary(raw, sport);
          const facts = [
            `${game.name}; start ${game.date}; status ${detail.game.status || game.status}; venue ${game.venue || "not supplied"}.`,
            `Reported starter flags: ${
              detail.players
                .filter((p) => p.starter)
                .map(
                  (p) =>
                    `${p.name} (${p.team}, ${p.position}${p.order ? `, batting ${p.order}` : ""})`,
                )
                .join("; ") || "not supplied; not confirmation that anyone is inactive"
            }.`,
            `Injury entries: ${detail.injuries.map((i) => `${i.name} (${i.team}): ${i.status}, ${i.detail}, reported ${i.date || "date unavailable"}`).join("; ") || "none supplied; availability unverified"}.`,
            `Moneyline snapshots: ${detail.markets.map((m) => `${m.provider} ${m.phase}: away ${m.away}, home ${m.home}`).join("; ") || "not supplied"}. Quote change times not supplied.`,
            `Local weather: ${detail.weather}. Roof conditions unverified.`,
          ];
          return {
            id: `game:${sport}:${game.id}`,
            league: sport,
            title: game.name,
            summary: facts.join("\n"),
            url: detail.source,
            publishedAt: detail.fetchedAt,
            source: "ESPN game feed · retrieval time",
            topic: "report" as const,
          };
        }),
      );
      for (const result of results)
        if (result.status === "fulfilled") context.push(result.value);
        else warnings.push(`${sport.toUpperCase()}: one matchup detail was unavailable.`);
    } catch {
      warnings.push(`${sport.toUpperCase()}: matchup context could not load.`);
    }
  }
  return { context, warnings };
}
