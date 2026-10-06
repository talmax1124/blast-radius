import { LIVE_CACHE_MS, matchMlbVenue } from "./live";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { SPORT_PATHS, list, normalizeGame, normalizeSummary, normalizeLog, str } from "./workbench";
const sport = z.enum(["mlb", "nfl", "nba", "nhl"]);
const id = z.string().regex(/^\d{1,12}$/);
import { feed } from "./workbench.server";
const base = "https://site.api.espn.com/apis/site/v2/sports/";
export const loadResearchGames = createServerFn({ method: "GET" })
  .validator(z.object({ sport, date: z.iso.date() }))
  .handler(async ({ data }) => {
    const raw = await feed(
      `${base}${SPORT_PATHS[data.sport]}/scoreboard?dates=${data.date.replaceAll("-", "")}&limit=100`,
      LIVE_CACHE_MS,
    );
    if (!Array.isArray(raw.events))
      throw new Error("The schedule source returned an incomplete response.");
    return { games: list(raw.events).map(normalizeGame), fetchedAt: str(raw.retrievedAt) };
  });
export const loadGameResearch = createServerFn({ method: "GET" })
  .validator(z.object({ sport, id }))
  .handler(async ({ data }) => {
    const raw = await feed(
      `${base}${SPORT_PATHS[data.sport]}/summary?event=${data.id}`,
      LIVE_CACHE_MS,
    );
    if (!raw.header?.id) throw new Error("Game details are not available from the source yet.");
    const detail = normalizeSummary(raw, data.sport);
    // Pregame summaries often have no player tables. Team rosters are a separate,
    // explicitly unconfirmed source; never infer a starting lineup from them.
    if (
      (detail.game.state === "pre" && !detail.players.length) ||
      detail.players.some((p) => !p.position)
    ) {
      const rosters = await Promise.allSettled(
        detail.game.teams.map(async (team) => {
          const roster = await feed(
            `${base}${SPORT_PATHS[data.sport]}/teams/${team.id}/roster`,
            300_000,
          );
          if (!Array.isArray(roster.athletes)) throw new Error("Roster unavailable");
          const athletes = list(roster.athletes).flatMap((group) =>
            Array.isArray(group.items) ? list(group.items) : [group],
          );
          return athletes.map((a) => ({
            id: str(a.id),
            name: str(a.displayName),
            team: team.code,
            position: str(a.position?.abbreviation),
            starter: false,
            order: null,
            hand: str(a.bats?.displayValue ?? a.throws?.displayValue),
            stats: [],
          }));
        }),
      );
      const rosterPlayers = rosters.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
      if (detail.players.length) {
        detail.players = detail.players.map((p) => ({
          ...p,
          position: p.position || rosterPlayers.find((r) => r.id === p.id)?.position || "",
        }));
      } else {
        detail.players = rosterPlayers;
        detail.warnings.push(
          "Pregame team rosters shown; game lineups are not confirmed. Rosters are current, not archived for the selected date.",
        );
      }
      if (rosters.some((r) => r.status === "rejected"))
        detail.warnings.push("One or more team rosters could not load.");
    }
    return detail;
  });
export const loadPlayerResearch = createServerFn({ method: "GET" })
  .validator(z.object({ sport, id, season: z.number().int().min(2000).max(2100) }))
  .handler(async ({ data }) => {
    const raw = await feed(
      `https://site.web.api.espn.com/apis/common/v3/sports/${SPORT_PATHS[data.sport]}/athletes/${data.id}/gamelog?season=${data.season}`,
      300_000,
    );
    if (!Array.isArray(raw.seasonTypes))
      throw new Error("Player game logs are unavailable from this source.");
    return normalizeLog(raw, data.sport, data.id);
  });

export const loadVenueCoordinates = createServerFn({ method: "GET" })
  .validator(z.object({ name: z.string().min(1).max(160) }))
  .handler(async ({ data }) => {
    const raw = await feed("https://statsapi.mlb.com/api/v1/venues?hydrate=location", 86_400_000);
    return {
      coordinates: matchMlbVenue(list(raw.venues), data.name),
      source: "https://statsapi.mlb.com/api/v1/venues?hydrate=location",
    };
  });
