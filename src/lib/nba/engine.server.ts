import { buildCard, projectPlayer, RIM, type Market, type Pos } from "./score.ts";
import type { NbaActual, NbaBoard, NbaGame, NbaPlayer } from "./types.ts";

const UA = "GreatRun/NBA-1.0";
const ESPN = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
const STATS = "https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes";

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
  if (!res.ok) throw new Error(`${res.status} ${url}`);
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

function etHour(d: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(d),
  );
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
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

function posOf(abbr: string): Pos {
  if (abbr === "C") return "C";
  if (abbr === "F" || abbr === "SF" || abbr === "PF") return "F";
  return "G";
}

function num(stats: string[], names: string[], key: string): number {
  const i = names.indexOf(key);
  if (i < 0) return 0;
  const n = Number(String(stats[i] ?? "").split("-")[0]);
  return Number.isFinite(n) ? n : 0;
}

type StatRow = { season?: { year?: number }; stats?: string[] };
type AthleteStats = { categories?: { name?: string; names?: string[]; statistics?: StatRow[] }[] };

function weigh(rows: { gp: number; min: number; pts: number; reb: number; ast: number; threes: number }[]) {
  const gp = rows.reduce((s, r) => s + r.gp, 0);
  const avg = (key: "min" | "pts" | "reb" | "ast" | "threes") =>
    gp > 0 ? rows.reduce((s, r) => s + r[key] * r.gp, 0) / gp : 0;
  return { gp, min: avg("min"), pts: avg("pts"), reb: avg("reb"), ast: avg("ast"), threes: avg("threes") };
}

async function loadAthlete(id: string): Promise<ReturnType<typeof weigh> & { careerGp: number; career: ReturnType<typeof weigh> } | null> {
  try {
    const data = await cached(`nba:stats:${id}`, 6 * 60 * 60 * 1000, () => getJson<AthleteStats>(`${STATS}/${id}/stats`));
    const avg = data.categories?.find((c) => c.name === "averages");
    const names = avg?.names ?? [];
    const rows = (avg?.statistics ?? [])
      .map((row) => ({
        year: row.season?.year ?? 0,
        gp: num(row.stats ?? [], names, "gamesPlayed"),
        min: num(row.stats ?? [], names, "avgMinutes"),
        pts: num(row.stats ?? [], names, "avgPoints"),
        reb: num(row.stats ?? [], names, "avgRebounds"),
        ast: num(row.stats ?? [], names, "avgAssists"),
        threes: num(row.stats ?? [], names, "avgThreePointFieldGoalsMade-avgThreePointFieldGoalsAttempted"),
      }))
      .filter((row) => row.gp > 0 && row.year > 0);
    if (!rows.length) return null;
    const year = Math.max(...rows.map((row) => row.year));
    const season = weigh(rows.filter((row) => row.year === year));
    const career = weigh(rows);
    return { ...season, careerGp: career.gp, career };
  } catch {
    return null;
  }
}

type RosterAthlete = {
  id?: string;
  displayName?: string;
  position?: { abbreviation?: string };
  injuries?: { status?: string }[];
};

function isOut(athlete: RosterAthlete): boolean {
  return (athlete.injuries ?? []).some((injury) => (injury.status ?? "").toLowerCase().includes("out"));
}

type Side = { id: string; abbr: string; name: string; home: boolean };

function actualOf(stats: string[], labels: string[]): NbaActual | null {
  const at = (name: string) => {
    const i = labels.findIndex((label) => label.toUpperCase() === name);
    return i >= 0 ? stats[i] ?? "" : "";
  };
  const min = Number(at("MIN"));
  const pts = Number(at("PTS"));
  const reb = Number(at("REB"));
  const ast = Number(at("AST"));
  const threes = Number(String(at("3PT")).split("-")[0]);
  if (![min, pts, reb, ast].every((n) => Number.isFinite(n))) return null;
  return { min, pts, reb, ast, threes: Number.isFinite(threes) ? threes : 0, pra: pts + reb + ast };
}

async function boxActuals(eventId: string): Promise<Map<string, NbaActual>> {
  const out = new Map<string, NbaActual>();
  try {
    const data = await getJson<{
      boxscore?: { players?: { statistics?: { labels?: string[]; athletes?: { athlete?: { id?: string }; stats?: string[] }[] }[] }[] };
    }>(`${ESPN}/summary?event=${eventId}`);
    for (const side of data.boxscore?.players ?? []) {
      for (const block of side.statistics ?? []) {
        const labels = block.labels ?? [];
        for (const athlete of block.athletes ?? []) {
          const id = athlete.athlete?.id;
          const actual = id ? actualOf(athlete.stats ?? [], labels) : null;
          if (id && actual) out.set(id, actual);
        }
      }
    }
  } catch {
    /* box can fail */
  }
  return out;
}

export async function buildNbaBoard(now = new Date()): Promise<NbaBoard> {
  let stamp = etStamp(now);
  if (etHour(now) >= 23) stamp = etStamp(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  const ymd = stamp.replaceAll("-", "");
  return cached(`nba:${RIM.version}:${ymd}`, 10 * 60 * 1000, () => loadBoard(ymd, stamp));
}

async function loadBoard(ymd: string, date: string): Promise<NbaBoard> {
  const scoreboard = await getJson<{
    events?: {
      id?: string;
      date?: string;
      competitions?: {
        status?: { type?: { state?: string } };
        competitors?: { homeAway?: string; team?: { id?: string; abbreviation?: string; displayName?: string } }[];
      }[];
    }[];
  }>(`${ESPN}/scoreboard?dates=${ymd}`);

  const games: NbaGame[] = [];
  const jobs: { game: NbaGame; side: Side }[] = [];
  for (const event of scoreboard.events ?? []) {
    const comp = event.competitions?.[0];
    const competitors = comp?.competitors ?? [];
    const away = competitors.find((c) => c.homeAway === "away");
    const home = competitors.find((c) => c.homeAway === "home");
    if (!event.id || !away?.team?.id || !home?.team?.id) continue;
    const state = comp?.status?.type?.state === "post" || comp?.status?.type?.state === "in" ? comp.status.type.state : "pre";
    const game: NbaGame = {
      id: event.id,
      away: away.team.abbreviation ?? "AWY",
      home: home.team.abbreviation ?? "HOM",
      awayName: away.team.displayName ?? "Away",
      homeName: home.team.displayName ?? "Home",
      start: event.date ? etClock(event.date) : "",
      state,
    };
    games.push(game);
    jobs.push({ game, side: { id: away.team.id, abbr: game.away, name: game.awayName, home: false } });
    jobs.push({ game, side: { id: home.team.id, abbr: game.home, name: game.homeName, home: true } });
  }

  const boxes = new Map<string, Map<string, NbaActual>>();
  await Promise.all(
    games
      .filter((game) => game.state !== "pre")
      .map(async (game) => {
        boxes.set(game.id, await boxActuals(game.id));
      }),
  );

  const rosters = await mapPool(jobs, 4, async (job) => {
    const roster = await getJson<{ athletes?: RosterAthlete[] }>(`${ESPN}/teams/${job.side.id}/roster`).catch(() => ({ athletes: [] }));
    const athletes = (roster.athletes ?? []).filter((athlete) => athlete.id && athlete.displayName && !isOut(athlete));
    return { job, athletes };
  });

  const fetched = await mapPool(rosters.flatMap((roster) => roster.athletes.map((athlete) => ({ roster, athlete }))), 8, async ({ roster, athlete }) => {
    const stats = await loadAthlete(athlete.id!);
    return { roster, athlete, stats };
  });

  const players: NbaPlayer[] = [];
  for (const row of fetched) {
    if (!row.stats || row.stats.gp < 1) continue;
    const { job } = row.roster;
    const opp = job.side.home ? job.game.away : job.game.home;
    const projected = projectPlayer({
      pos: posOf(row.athlete.position?.abbreviation ?? "G"),
      gp: row.stats.gp,
      season: row.stats,
      careerGp: row.stats.careerGp,
      career: row.stats.career,
      home: job.side.home,
    });
    if (projected.minutes < 18) continue;
    const actual = boxes.get(job.game.id)?.get(row.athlete.id!) ?? null;
    players.push({
      id: `${job.game.id}:${row.athlete.id}`,
      espnId: row.athlete.id!,
      name: row.athlete.displayName!,
      team: job.side.abbr,
      opp,
      pos: row.athlete.position?.abbreviation ?? "G",
      home: job.side.home,
      gameId: job.game.id,
      start: job.game.start,
      gp: row.stats.gp,
      minutes: projected.minutes,
      quotes: projected.quotes,
      actual,
    });
  }
  players.sort((a, b) => b.quotes.pts.projection - a.quotes.pts.projection);

  const legs = buildCard(players);
  const sweep = legs.reduce((p, leg) => p * leg.cover, 1);
  const markets: Record<Market, string> = {
    pts: "Points",
    reb: "Rebounds",
    ast: "Assists",
    threes: "Threes",
    pra: "Pts+Reb+Ast",
  };

  return {
    date,
    fetchedAt: new Date().toISOString(),
    model: { version: RIM.version, name: RIM.name },
    games,
    players,
    slip: legs.length
      ? {
          title: `${legs.length}-leg shop card`,
          sweep,
          note: "Not a posted ticket. Buy the over only if the book is at or under the cash number. The sweep is the product of the minute-cut covers, not a parlay price.",
          legs: legs.map((leg) => ({
            name: leg.name,
            team: leg.team,
            market: leg.market,
            projection: leg.projection,
            line: leg.line,
            cover: leg.cover,
          })),
        }
      : null,
    notes: [
      `${RIM.name} ${RIM.version}. Minutes and per-minute rates shrink toward a position prior with a ${RIM.shrinkGames}-game weight. Home scoring and threes get 2%.`,
      `An over is live only if six minutes off still covers a number close to the projection. An under is live only if four extra minutes still leave it a dog, and that number is still close. A 0.5 three is not a bet. Out players are off the board.`,
      `The cash number is the line we would buy. It is not a DraftKings or PrizePicks print. ${legs.length ? `Shop card uses ${legs.map((leg) => markets[leg.market]).join(", ")}.` : "No two-game card cleared the minute cut."}`,
    ],
  };
}
