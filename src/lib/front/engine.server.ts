const UA = "GreatRun/Front-1.0";

export type FrontGame = { id: string; label: string; start: string; state: string };
export type FrontSport = { id: string; label: string; href: string; games: FrontGame[] };
export type FrontBoard = { date: string; sports: FrontSport[] };

const SPORTS: { id: string; label: string; href: string; path: string }[] = [
  { id: "mlb", label: "MLB", href: "/mlb", path: "baseball/mlb" },
  { id: "nfl", label: "NFL", href: "/nfl", path: "football/nfl" },
  { id: "nba", label: "NBA", href: "/nba", path: "basketball/nba" },
  { id: "nhl", label: "NHL", href: "/nhl", path: "hockey/nhl" },
  { id: "soccer", label: "Soccer", href: "/soccer", path: "soccer/uefa.champions" },
];

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

type Scoreboard = {
  events?: {
    id?: string;
    name?: string;
    date?: string;
    competitions?: {
      status?: { type?: { state?: string } };
      competitors?: { homeAway?: string; team?: { abbreviation?: string; shortDisplayName?: string } }[];
    }[];
  }[];
};

async function slate(path: string, ymd: string): Promise<FrontGame[]> {
  try {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${ymd}`, {
      headers: { Accept: "application/json", "User-Agent": UA },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as Scoreboard;
    return (data.events ?? []).slice(0, 8).map((event) => {
      const comp = event.competitions?.[0];
      const sides = comp?.competitors ?? [];
      const away = sides.find((side) => side.homeAway === "away")?.team;
      const home = sides.find((side) => side.homeAway === "home")?.team;
      const state = comp?.status?.type?.state ?? "pre";
      const label =
        away?.abbreviation && home?.abbreviation
          ? `${away.abbreviation} at ${home.abbreviation}`
          : (event.name ?? "Game");
      return {
        id: event.id ?? label,
        label,
        start: event.date ? etClock(event.date) : "",
        state,
      };
    });
  } catch {
    return [];
  }
}

export async function buildFront(now = new Date()): Promise<FrontBoard> {
  const date = etStamp(now);
  const ymd = date.replaceAll("-", "");
  const sports = await Promise.all(
    SPORTS.map(async (sport) => ({
      id: sport.id,
      label: sport.label,
      href: sport.href,
      games: await slate(sport.path, ymd),
    })),
  );
  return { date, sports };
}
