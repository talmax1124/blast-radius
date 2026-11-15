import { parseStatus, type DepthRow, type InjuryRow } from "./roster.ts";
import { NFL_STADIUMS, type Weather } from "./weather.ts";

/**
 * Live inputs checked before a sim runs: ESPN depth charts and injury reports, and the Open-Meteo forecast
 * at the stadium for kickoff. All free, no keys. Each fetch fails soft (empty result plus a note) so a
 * missing feed never blocks a card silently: the caller prints what it could not check.
 */

const SITE = "https://site.api.espn.com/apis/site/v2/sports";
const CORE = "https://sports.core.api.espn.com/v2/sports";

type League = "nfl" | "nba";
const PATH: Record<League, string> = { nfl: "football/nfl", nba: "basketball/nba" };

async function json(url: string): Promise<any> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} from ${url}`);
  return res.json();
}

/** ESPN team ids and names by abbreviation. */
export async function espnTeams(league: League): Promise<Map<string, { id: string; name: string }>> {
  const d = await json(`${SITE}/${PATH[league]}/teams`);
  const out = new Map<string, { id: string; name: string }>();
  for (const t of d.sports[0].leagues[0].teams) out.set(t.team.abbreviation, { id: t.team.id, name: t.team.displayName });
  return out;
}

export async function espnInjuries(league: League, teams: string[]): Promise<InjuryRow[]> {
  const ids = await espnTeams(league);
  const byName = new Map([...ids].map(([abbr, t]) => [t.name, abbr]));
  const d = await json(`${SITE}/${PATH[league]}/injuries`);
  const out: InjuryRow[] = [];
  for (const t of d.injuries ?? []) {
    const abbr = byName.get(t.displayName);
    if (!abbr || !teams.includes(abbr)) continue;
    for (const i of t.injuries ?? []) out.push({ team: abbr, name: i.athlete?.displayName ?? "", status: parseStatus(i.status) });
  }
  return out;
}

/** Offense depth chart (QB, RB, WR, TE) with each player's roster status. */
export async function nflDepth(team: string, season: number): Promise<DepthRow[]> {
  const ids = await espnTeams("nfl");
  const id = ids.get(team)?.id;
  if (!id) return [];
  const roster = await json(`${SITE}/football/nfl/teams/${id}/roster`);
  const people = new Map<string, { name: string; status: string }>();
  for (const g of roster.athletes ?? []) {
    for (const a of g.items ?? []) {
      const injury = (a.injuries ?? [])[0]?.status;
      people.set(String(a.id), { name: a.displayName, status: injury ?? a.status?.type ?? "active" });
    }
  }
  const chart = await json(`${CORE}/football/leagues/nfl/seasons/${season}/teams/${id}/depthcharts`);
  const offense = (chart.items ?? []).find((x: any) => x.positions?.qb || x.positions?.rb) ?? chart.items?.[0];
  const out: DepthRow[] = [];
  for (const [key, pos] of [["qb", "QB"], ["rb", "RB"], ["wr", "WR"], ["te", "TE"]] as const) {
    const slot = offense?.positions?.[key];
    if (!slot) continue;
    for (const a of slot.athletes ?? []) {
      const aid = String(a.athlete?.$ref ?? "").match(/athletes\/(\d+)/)?.[1];
      const who = aid ? people.get(aid) : undefined;
      if (!who) continue;
      const s = who.status.toLowerCase();
      out.push({ team, pos, rank: a.rank ?? a.slot ?? 99, name: who.name, status: s.includes("practice") ? "out" : parseStatus(who.status) });
    }
  }
  return out;
}

/**
 * Forecast for the kickoff hours at the home stadium. Retractable roofs are treated as closed when it is
 * cold, wet or windy, which is how those teams run them.
 */
export async function nflWeather(home: string, kickoffIso: string): Promise<Weather | null> {
  const s = NFL_STADIUMS[home];
  if (!s) return null;
  if (s.roof === "dome") return { dome: true, tempF: 70, windMph: 0, precipIn: 0 };
  const day = kickoffIso.slice(0, 10);
  const next = new Date(Date.parse(day) + 86400000).toISOString().slice(0, 10);
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${s.lat}&longitude=${s.lon}` +
    `&hourly=temperature_2m,wind_speed_10m,wind_gusts_10m,precipitation,snowfall` +
    `&wind_speed_unit=mph&temperature_unit=fahrenheit&precipitation_unit=inch&timezone=UTC&start_date=${day}&end_date=${next}`;
  const d = await json(url);
  const t0 = Date.parse(kickoffIso);
  const hours: number[] = [];
  (d.hourly?.time ?? []).forEach((t: string, i: number) => {
    const at = Date.parse(`${t}:00Z`);
    if (at >= t0 && at < t0 + 3 * 3600000) hours.push(i);
  });
  if (!hours.length) return null;
  const avg = (k: string) => hours.reduce((sum, i) => sum + (d.hourly[k]?.[i] ?? 0), 0) / hours.length;
  const w: Weather = {
    dome: false,
    tempF: avg("temperature_2m"),
    windMph: avg("wind_speed_10m"),
    gustMph: avg("wind_gusts_10m"),
    precipIn: avg("precipitation"),
    snow: avg("snowfall") > 0.01,
  };
  if (s.roof === "retractable" && (w.tempF < 50 || w.precipIn >= 0.02 || w.windMph > 15)) return { ...w, dome: true };
  return w;
}

/** Kickoff time for a game from ESPN's scoreboard, by home team, on a given date (YYYYMMDD). */
export async function kickoff(league: League, date: string, home: string): Promise<string | null> {
  const d = await json(`${SITE}/${PATH[league]}/scoreboard?dates=${date}`);
  for (const e of d.events ?? []) {
    const h = e.competitions?.[0]?.competitors?.find((c: any) => c.homeAway === "home");
    if (h?.team?.abbreviation === home) return e.date;
  }
  return null;
}

/** Share of the team's pass attempts this season thrown by one quarterback, from ESPN box scores. */
export async function nflPassShare(team: string, season: number, qb: string): Promise<{ share: number; attempts: number; teamAttempts: number }> {
  const ids = await espnTeams("nfl");
  const id = ids.get(team)?.id;
  if (!id) return { share: 1, attempts: 0, teamAttempts: 0 };
  const sch = await json(`${SITE}/football/nfl/teams/${id}/schedule?season=${season}`);
  let mine = 0;
  let all = 0;
  for (const e of sch.events ?? []) {
    if (!e.competitions?.[0]?.status?.type?.completed) continue;
    const s = await json(`${SITE}/football/nfl/summary?event=${e.id}`);
    for (const t of s.boxscore?.players ?? []) {
      if (t.team?.abbreviation !== team) continue;
      const passing = (t.statistics ?? []).find((x: any) => x.name === "passing");
      for (const a of passing?.athletes ?? []) {
        const idx = (passing.labels as string[]).indexOf("C/ATT");
        const att = Number(String(a.stats?.[idx] ?? "0/0").split("/")[1]) || 0;
        all += att;
        if (a.athlete?.displayName === qb) mine += att;
      }
    }
  }
  return { share: all > 0 ? mine / all : 1, attempts: mine, teamAttempts: all };
}

/**
 * The game's own injury list from ESPN's event summary. It is refreshed for the matchup, so it is a second
 * opinion on the league-wide injury feed, which has kept stale "out" tags (Skattebo, Nov 12).
 */
export async function espnGameInjuries(league: League, eventId: string): Promise<InjuryRow[]> {
  const d = await json(`${SITE}/${PATH[league]}/summary?event=${eventId}`);
  const out: InjuryRow[] = [];
  for (const t of d.injuries ?? []) {
    const team = t.team?.abbreviation ?? "";
    for (const i of t.injuries ?? []) out.push({ team, name: i.athlete?.displayName ?? "", status: parseStatus(i.status) });
  }
  return out;
}

/**
 * Players DraftKings has props posted for in one event (from ESPN's odds feed). A book that still posts a
 * player expects him to play; a book with nothing on a usual starter expects him out.
 */
export async function bookPlayers(league: League, eventId: string): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let page = 1; ; page++) {
    const d = await json(`${CORE}/${PATH[league].replace("/", "/leagues/")}/events/${eventId}/competitions/${eventId}/odds/100/propBets?limit=500&page=${page}`);
    for (const it of d.items ?? []) {
      const m = /athletes\/(\d+)/.exec(it.athlete?.$ref ?? "");
      if (m) ids.add(m[1]);
    }
    if (page >= (d.pageCount ?? 1)) break;
  }
  const season = new Date().getUTCMonth() >= 7 ? new Date().getUTCFullYear() + (league === "nba" ? 1 : 0) : new Date().getUTCFullYear();
  const names = await Promise.all([...ids].map(async (id) => {
    try { return (await json(`${CORE}/${PATH[league].replace("/", "/leagues/")}/seasons/${season}/athletes/${id}`)).displayName as string; } catch { return null; }
  }));
  return new Set(names.filter((n): n is string => !!n));
}

const BOOK_STAT: Record<string, string> = {
  "Total Points": "pts", "Total Rebounds": "reb", "Total Assists": "ast", "Total 3-Point Field Goals": "threes", "Total Points, Rebounds, and Assists": "pra",
  "Total Passing Yards (incl. overtime)": "passYd", "Total Rushing Yards (incl. overtime)": "rushYd", "Total Receiving Yards (incl. overtime)": "recYd", "Total Receptions (incl. overtime)": "rec",
};

/**
 * DraftKings' main player lines for one event from ESPN's odds feed, with over and under prices when the
 * feed carries them (NBA does; NFL often posts the line alone). Feeds `anchorNba` / `anchorNfl` and the
 * market side of `finalChance`.
 */
export async function bookLines(league: League, eventId: string): Promise<{ name: string; stat: string; line: number; over: number | null; under: number | null }[]> {
  const base = `${CORE}/${PATH[league].replace("/", "/leagues/")}`;
  const raw = new Map<string, { id: string; stat: string; line: number; prices: number[] }>();
  for (let page = 1; ; page++) {
    const d = await json(`${base}/events/${eventId}/competitions/${eventId}/odds/100/propBets?limit=500&page=${page}`);
    for (const it of d.items ?? []) {
      const stat = BOOK_STAT[it.type?.name ?? ""];
      const m = /athletes\/(\d+)/.exec(it.athlete?.$ref ?? "");
      const line = it.current?.target?.value;
      if (!stat || !m || line == null) continue;
      const k = `${m[1]}|${stat}|${line}`;
      if (!raw.has(k)) raw.set(k, { id: m[1], stat, line, prices: [] });
      const p = Number(String(it.odds?.american?.value ?? "").replace("EVEN", "100"));
      if (Number.isFinite(p) && p !== 0) raw.get(k)!.prices.push(p);
    }
    if (page >= (d.pageCount ?? 1)) break;
  }
  const season = new Date().getUTCMonth() >= 7 ? new Date().getUTCFullYear() + (league === "nba" ? 1 : 0) : new Date().getUTCFullYear();
  const names = new Map<string, string>();
  await Promise.all([...new Set([...raw.values()].map((r) => r.id))].map(async (id) => {
    try { names.set(id, (await json(`${base}/seasons/${season}/athletes/${id}`)).displayName); } catch { /* unnamed players are skipped */ }
  }));
  return [...raw.values()].filter((r) => names.has(r.id)).map((r) => ({
    name: names.get(r.id)!, stat: r.stat, line: r.line,
    over: r.prices.length === 2 ? r.prices[0] : null, under: r.prices.length === 2 ? r.prices[1] : null,
  }));
}
