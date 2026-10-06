// The provider boundary accepts variable schemas; only these normalized fields reach the client.
export type ResearchSport = "mlb" | "nfl" | "nba" | "nhl";
export const SPORT_PATHS: Record<ResearchSport, string> = {
  mlb: "baseball/mlb",
  nfl: "football/nfl",
  nba: "basketball/nba",
  nhl: "hockey/nhl",
};
export type Stat = { label: string; value: string };
export type ResearchGame = {
  season: number | null;
  id: string;
  name: string;
  date: string;
  state: string;
  status: string;
  venue: string;
  teams: { id: string; name: string; code: string; side: string; score: string; record: string }[];
};
export type ResearchPlayer = {
  id: string;
  name: string;
  team: string;
  position: string;
  starter: boolean;
  order: number | null;
  hand: string;
  stats: Stat[];
};
export type GameResearch = {
  game: ResearchGame;
  fetchedAt: string;
  source: string;
  players: ResearchPlayer[];
  injuries: { name: string; team: string; status: string; detail: string; date: string }[];
  markets: {
    provider: string;
    phase: string;
    away: string;
    home: string;
    awayFair: number | null;
    homeFair: number | null;
    spread: string;
    total: string;
  }[];
  teamStats: { team: string; stats: Stat[] }[];
  news: { title: string; url: string; date: string }[];
  warnings: string[];
  weather: string;
  series: string[];
};
export type PlayerLog = {
  labels: string[];
  rows: {
    id: string;
    date: string;
    opponent: string;
    opponentId: string;
    location: string;
    result: string;
    seasonType: string;
    stats: string[];
  }[];
  fetchedAt: string;
  source: string;
};
export type FeedObject = Record<string, any>;
export const list = (v: unknown): FeedObject[] =>
  Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : [];
export const str = (v: unknown): string =>
  typeof v === "string" || typeof v === "number" ? String(v) : "";
export function safeEspnUrl(value: unknown): string {
  try {
    const url = new URL(str(value));
    return url.protocol === "https:" &&
      (url.hostname === "espn.com" || url.hostname.endsWith(".espn.com"))
      ? url.href
      : "";
  } catch {
    return "";
  }
}
export function implied(value: unknown): number | null {
  const raw = str(value).trim();
  if (!/^[+-]?\d+(\.\d+)?$/.test(raw)) return null;
  const n = Number(raw);
  return Math.abs(n) < 100 ? null : n > 0 ? 100 / (n + 100) : -n / (-n + 100);
}
export function normalizeGame(event: FeedObject): ResearchGame {
  const c = list(event.competitions)[0] ?? {};
  const status = c.status ?? event.status ?? {};
  return {
    season: Number.isInteger(event.season?.year) ? event.season.year : null,
    id: str(event.id),
    name: str(event.name),
    date: str(event.date ?? c.date),
    state: str(status.type?.state),
    status: str(status.type?.detail ?? status.type?.description),
    venue: str(c.venue?.fullName),
    teams: list(c.competitors)
      .map((t) => ({
        id: str(t.team?.id),
        name: str(t.team?.displayName),
        code: str(t.team?.abbreviation),
        side: str(t.homeAway),
        score: str(t.score?.displayValue ?? t.score),
        record: str(list(t.records).find((r) => r.type === "total")?.summary),
      }))
      .sort((a, b) => (a.side === b.side ? 0 : a.side === "away" ? -1 : 1)),
  };
}
const statsOf = (items: unknown): Stat[] =>
  list(items)
    .flatMap((s) =>
      Array.isArray(s.stats)
        ? statsOf(s.stats)
        : [
            {
              label: str(s.abbreviation ?? s.label ?? s.name),
              value: str(s.displayValue ?? s.value),
            },
          ],
    )
    .filter((s) => s.label && s.value);
export function normalizeSummary(raw: FeedObject, sport: ResearchSport): GameResearch {
  const game = normalizeGame(raw.header ?? {});
  const players = new Map<string, ResearchPlayer>();
  for (const team of list(raw.rosters))
    for (const p of list(team.roster)) {
      const a = p.athlete ?? {};
      if (!a.id) continue;
      players.set(str(a.id), {
        id: str(a.id),
        name: str(a.displayName),
        team: str(team.team?.abbreviation),
        position: str(p.position?.abbreviation ?? a.position?.abbreviation),
        starter: p.starter === true,
        order: Number(p.batOrder) > 0 ? Number(p.batOrder) : null,
        hand: str(a.bats?.displayValue ?? a.throws?.displayValue),
        stats: statsOf(p.stats),
      });
    }
  for (const team of list(raw.boxscore?.players))
    for (const group of list(team.statistics))
      for (const row of list(group.athletes)) {
        const a = row.athlete ?? {};
        if (!a.id) continue;
        const old = players.get(str(a.id));
        const labels: string[] = Array.isArray(group.labels) ? group.labels : [];
        const more = (Array.isArray(row.stats) ? row.stats : []).map((v: unknown, i: number) => ({
          label: `${str(group.type ?? group.name)} ${str(labels[i])}`.trim(),
          value: str(v),
        }));
        players.set(str(a.id), {
          id: str(a.id),
          name: str(a.displayName),
          team: str(team.team?.abbreviation),
          position: str(a.position?.abbreviation),
          starter: row.starter === true,
          order: null,
          hand: "",
          ...old,
          stats: [...(old?.stats ?? []), ...more],
        });
      }
  const markets = list(raw.pickcenter).flatMap((p) =>
    ["open", "close", "live"].flatMap((phase) => {
      const home = str(p.moneyline?.home?.[phase]?.odds),
        away = str(p.moneyline?.away?.[phase]?.odds);
      if (!home && !away) return [];
      const h = implied(home),
        a = implied(away),
        sum = h != null && a != null ? h + a : 0;
      return [
        {
          provider: str(p.provider?.name),
          phase,
          home,
          away,
          homeFair: sum && h != null ? h / sum : null,
          awayFair: sum && a != null ? a / sum : null,
          spread: str(p.pointSpread?.home?.[phase]?.line),
          total: str(p.total?.over?.[phase]?.line),
        },
      ];
    }),
  );
  const weather = raw.gameInfo?.weather;
  return {
    game,
    fetchedAt: str(raw.retrievedAt) || new Date().toISOString(),
    source: `https://www.espn.com/${sport}/game/_/gameId/${game.id}`,
    players: [...players.values()].sort(
      (a, b) =>
        a.team.localeCompare(b.team) ||
        Number(b.starter) - Number(a.starter) ||
        (a.order ?? 99) - (b.order ?? 99),
    ),
    injuries: list(raw.injuries).flatMap((t) =>
      list(t.injuries).map((i) => ({
        name: str(i.athlete?.displayName),
        team: str(t.team?.abbreviation),
        status: str(i.status),
        detail: str(i.details?.detail ?? i.details?.type ?? i.shortComment),
        date: str(i.date),
      })),
    ),
    markets,
    teamStats: list(raw.boxscore?.teams).map((t) => ({
      team: str(t.team?.abbreviation),
      stats: statsOf(t.statistics),
    })),
    news: list(raw.news?.articles)
      .map((a) => ({
        title: str(a.headline),
        url: safeEspnUrl(a.links?.web?.href),
        date: str(a.published),
      }))
      .filter((a) => a.url),
    warnings: [],
    weather: weather
      ? [weather.temperature != null ? `${weather.temperature}°F` : "", str(weather.conditionId)]
          .filter(Boolean)
          .join(" · ")
      : "Not supplied",
    series: list(raw.seasonseries)
      .map((s) => str(s.summary))
      .filter(Boolean),
  };
}
export function normalizeLog(raw: FeedObject, sport: ResearchSport, athlete: string): PlayerLog {
  const rows = new Map<string, PlayerLog["rows"][number]>();
  for (const season of list(raw.seasonTypes))
    for (const category of list(season.categories))
      for (const e of list(category.events)) {
        const event = raw.events?.[str(e.eventId)];
        if (
          !event?.gameDate ||
          !Number.isFinite(Date.parse(event.gameDate)) ||
          !Array.isArray(e.stats)
        )
          continue;
        rows.set(str(e.eventId), {
          id: str(e.eventId),
          date: str(event.gameDate),
          opponent: str(event.opponent?.abbreviation),
          opponentId: str(event.opponent?.id),
          location: str(event.atVs),
          result: [str(event.gameResult), str(event.score)].filter(Boolean).join(" "),
          seasonType: str(season.displayName),
          stats: e.stats.map(str),
        });
      }
  return {
    labels: Array.isArray(raw.labels)
      ? raw.labels.map((label: unknown, i: number) =>
          raw.labels.filter((other: unknown) => other === label).length > 1
            ? str(raw.displayNames?.[i] ?? raw.names?.[i] ?? label)
            : str(label),
        )
      : [],
    rows: [...rows.values()].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)),
    fetchedAt: str(raw.retrievedAt) || new Date().toISOString(),
    source: `https://www.espn.com/${sport}/player/gamelog/_/id/${athlete}`,
  };
}
export function sampleStats(rows: PlayerLog["rows"], index: number, line: number) {
  const values = rows
    .map((r) => r.stats[index])
    .filter((v) => v != null && v.trim() !== "" && /^-?\d+(\.\d+)?$/.test(v))
    .map(Number);
  const sorted = [...values].sort((a, b) => a - b),
    n = values.length;
  return {
    n,
    average: n ? values.reduce((a, b) => a + b, 0) / n : null,
    median: n ? (sorted[Math.floor((n - 1) / 2)] + sorted[Math.ceil((n - 1) / 2)]) / 2 : null,
    over: values.filter((v) => v > line).length,
    push: values.filter((v) => v === line).length,
    values,
  };
}

export function priorGameRows(
  rows: PlayerLog["rows"],
  date: string,
  split: string,
  opponentId: string,
  window: string,
) {
  const easternDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return rows
    .filter(
      (row) =>
        Number.isFinite(Date.parse(row.date)) && easternDate.format(new Date(row.date)) < date,
    )
    .filter((row) =>
      split === "opponent"
        ? row.opponentId === opponentId
        : split === "home"
          ? row.location === "vs"
          : split === "away"
            ? row.location === "@"
            : true,
    )
    .slice(0, window === "all" ? undefined : Number(window));
}
