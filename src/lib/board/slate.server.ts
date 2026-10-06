import { golfLine, parseScoreboard, type SlateBoard } from "./slate.ts";
import type { Sport } from "./types.ts";

const LEAGUES: { sport: Sport; path: string }[] = [
  { sport: "nba", path: "basketball/nba" },
  { sport: "wnba", path: "basketball/wnba" },
  { sport: "mlb", path: "baseball/mlb" },
  { sport: "nwsl", path: "soccer/usa.nwsl" },
  { sport: "arg", path: "soccer/arg.1" },
  { sport: "uru", path: "soccer/uru.1" },
  { sport: "col", path: "soccer/col.1" },
];

function todayEt(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(now);
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { "User-Agent": "GreatRun/Board-1.0" },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`slate ${res.status}`);
  return res.json();
}

export type { SlateBoard };

export async function loadSlate(now = new Date()): Promise<SlateBoard> {
  const date = todayEt(now);
  const stamp = date.replaceAll("-", "");
  const [boards, golf] = await Promise.all([
    Promise.all(
      LEAGUES.map(async (league) => {
        try {
          const payload = await getJson(
            `https://site.api.espn.com/apis/site/v2/sports/${league.path}/scoreboard?dates=${stamp}`,
          );
          return parseScoreboard(payload, league.sport, date);
        } catch {
          return { games: [], legs: [], prices: [] };
        }
      }),
    ),
    getJson(`https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard?dates=${stamp}`)
      .then((payload) => golfLine(payload))
      .catch(() => null),
  ]);
  return {
    date,
    games: boards.flatMap((board) => board.games),
    legs: boards.flatMap((board) => board.legs),
    prices: boards.flatMap((board) => board.prices),
    aside: golf ? [golf] : [],
  };
}
