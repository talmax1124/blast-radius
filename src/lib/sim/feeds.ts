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
