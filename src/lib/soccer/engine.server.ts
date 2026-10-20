import { buildCard, PITCH, posOf, projectPlayer } from "./score.ts";
import type { SoccerBoard, SoccerGame, SoccerPlayer } from "./types.ts";

const UA = "GreatRun/Soccer-1.0";
const ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const WEB = "https://site.web.api.espn.com/apis/common/v3/sports/soccer";

const LEAGUES: { slug: string; label: string }[] = [
  { slug: "uefa.champions", label: "Champions League" },
  { slug: "uefa.europa", label: "Europa League" },
  { slug: "eng.1", label: "Premier League" },
  { slug: "esp.1", label: "La Liga" },
  { slug: "ger.1", label: "Bundesliga" },
  { slug: "ita.1", label: "Serie A" },
  { slug: "fra.1", label: "Ligue 1" },
  { slug: "usa.1", label: "MLS" },
];

const INTL = ["friendly", "world cup", "nations", "euro", "international", "qualifier"];

type CacheEntry<T> = { expires: number; value: T };
const cache = new Map<string, CacheEntry<unknown>>();

function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return Promise.resolve(hit.value as T);
  return fn().then((value) => {
    cache.set(key, { expires: Date.now() + ttlMs, value });
    return value;
  });
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": UA },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return (await res.json()) as T;
}

function etStamp(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function etClock(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next;
      next += 1;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

type EventJson = {
  events?: {
    id?: string;
    date?: string;
    competitions?: {
      status?: { type?: { state?: string } };
      competitors?: { homeAway?: string; team?: { id?: string; abbreviation?: string; displayName?: string } }[];
    }[];
  }[];
};

async function pickLeague(ymd: string): Promise<{ slug: string; label: string; events: EventJson["events"] }> {
  for (const league of LEAGUES) {
    try {
      const data = await getJson<EventJson>(`${ESPN}/${league.slug}/scoreboard?dates=${ymd}`);
      if (data.events?.length) return { ...league, events: data.events };
    } catch {
      /* next league */
    }
  }
  return { slug: "uefa.champions", label: "Champions League", events: [] };
}

type Athlete = {
  id?: string;
  displayName?: string;
  position?: { abbreviation?: string };
  injuries?: { status?: string }[];
};

function isOut(athlete: Athlete): boolean {
  return (athlete.injuries ?? []).some((injury) => (injury.status ?? "").toLowerCase().includes("out"));
}

function clubTotals(
  stats: { names?: string[]; splits?: { displayName?: string; teamId?: string; stats?: string[] }[] } | undefined,
  teamId: string,
): { starts: number; shots: number; sot: number; goals: number } {
  const names = stats?.names ?? [];
  const at = (row: string[], key: string) => {
    const i = names.indexOf(key);
    const n = i >= 0 ? Number(row[i] ?? "") : 0;
    return Number.isFinite(n) ? n : 0;
  };
  const totals = { starts: 0, shots: 0, sot: 0, goals: 0 };
  for (const split of stats?.splits ?? []) {
    const label = (split.displayName ?? "").toLowerCase();
    if (INTL.some((word) => label.includes(word))) continue;
    if (split.teamId && split.teamId !== teamId) continue;
    const row = split.stats ?? [];
    totals.starts += at(row, "starts");
    totals.shots += at(row, "totalShots");
    totals.sot += at(row, "shotsOnTarget");
    totals.goals += at(row, "totalGoals");
  }
  return totals;
}

export async function buildSoccerBoard(now = new Date()): Promise<SoccerBoard> {
  const date = etStamp(now);
  const ymd = date.replaceAll("-", "");
  return cached(`soccer:${PITCH.version}:${ymd}`, 10 * 60 * 1000, () => loadBoard(ymd, date));
}

async function loadBoard(ymd: string, date: string): Promise<SoccerBoard> {
  const league = await pickLeague(ymd);
  const games: SoccerGame[] = [];
  const jobs: { game: SoccerGame; teamId: string; abbr: string; home: boolean }[] = [];
  for (const event of league.events ?? []) {
    const comp = event.competitions?.[0];
    const competitors = comp?.competitors ?? [];
    const away = competitors.find((c) => c.homeAway === "away");
    const home = competitors.find((c) => c.homeAway === "home");
    if (!event.id || !away?.team?.id || !home?.team?.id) continue;
    const state = comp?.status?.type?.state === "post" || comp?.status?.type?.state === "in" ? comp.status.type.state : "pre";
    const game: SoccerGame = {
      id: event.id,
      away: away.team.abbreviation ?? "AWY",
      home: home.team.abbreviation ?? "HOM",
      awayName: away.team.displayName ?? "Away",
      homeName: home.team.displayName ?? "Home",
      start: event.date ? etClock(event.date) : "",
      state,
    };
    games.push(game);
    jobs.push({ game, teamId: away.team.id, abbr: game.away, home: false });
    jobs.push({ game, teamId: home.team.id, abbr: game.home, home: true });
  }

  const rosters = await mapPool(jobs, 4, async (job) => {
    const roster = await getJson<{ athletes?: Athlete[] }>(`${ESPN}/${league.slug}/teams/${job.teamId}/roster`).catch(() => ({ athletes: [] }));
    const athletes = (roster.athletes ?? []).filter((athlete) => athlete.id && athlete.displayName && posOf(athlete.position?.abbreviation ?? "") && !isOut(athlete));
    return { job, athletes };
  });

  const fetched = await mapPool(
    rosters.flatMap((roster) => roster.athletes.map((athlete) => ({ roster, athlete }))),
    8,
    async ({ roster, athlete }) => {
      try {
        const data = await cached(`soccer:ov:${athlete.id}`, 6 * 60 * 60 * 1000, () =>
          getJson<{ statistics?: { names?: string[]; splits?: { displayName?: string; teamId?: string; stats?: string[] }[] } }>(
            `${WEB}/${league.slug}/athletes/${athlete.id}/overview`,
          ),
        );
        return { roster, athlete, totals: clubTotals(data.statistics, roster.job.teamId) };
      } catch {
        return { roster, athlete, totals: { starts: 0, shots: 0, sot: 0, goals: 0 } };
      }
    },
  );

  const players: SoccerPlayer[] = [];
  for (const row of fetched) {
    const pos = posOf(row.athlete.position?.abbreviation ?? "");
    if (!pos || row.totals.starts < PITCH.minStarts) continue;
    const projected = projectPlayer({ pos, ...row.totals });
    const { job } = row.roster;
    const opp = job.home ? job.game.away : job.game.home;
    players.push({
      id: `${job.game.id}:${row.athlete.id}`,
      name: row.athlete.displayName!,
      team: job.abbr,
      opp,
      pos,
      gameId: job.game.id,
      start: job.game.start,
      starts: row.totals.starts,
      shots: projected.shots,
      sot: projected.sot,
      goals: projected.goals,
      pShots15: projected.pShots15,
      pSot05: projected.pSot05,
      pGoal: projected.pGoal,
      cashShots: projected.cashShots,
    });
  }
  players.sort((a, b) => b.shots - a.shots);
  const legs = buildCard(
    players.map((player) => ({
      id: player.id,
      name: player.name,
      team: player.team,
      gameId: player.gameId,
      starts: player.starts,
      shots: player.shots,
      cover: player.pShots15,
      cash: player.cashShots,
    })),
  );
  const sweep = legs.reduce((p, leg) => p * leg.cover, 1);
  return {
    date,
    league: league.label,
    fetchedAt: new Date().toISOString(),
    model: { version: PITCH.version, name: PITCH.name },
    games,
    players,
    slip: legs.length
      ? {
          title: `${legs.length}-leg shot card`,
          sweep,
          note: "Not a posted ticket. Buy shots over 1.5 only if the book is 1.5. The sweep is the product of the quiet-night covers.",
          legs: legs.map((leg) => ({
            name: leg.name,
            team: leg.team,
            projection: leg.projection,
            line: leg.line,
            cover: leg.cover,
          })),
        }
      : null,
    notes: [
      `${PITCH.name} ${PITCH.version}. Shots per start, shrunk toward a forward, midfield, or defense prior. Only club splits for this team. Internationals are ignored. Fewer than ${PITCH.minStarts} starts stays off the board.`,
      `A shot over is live only if a quiet night, ${Math.round(PITCH.quiet * 100)}% of the rate, still clears 1.5 shots more than half the time. Goals and shots on target are shown. They are not the card.`,
    ],
  };
}
