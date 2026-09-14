import { namesMatch } from "./parse";
import { normAbbr } from "./parks";
import type { LineupSpot, LineupStatus, WeatherSnap } from "./types";
import { windCarry } from "./parks";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export type RotowireTeam = {
  abbr: string;
  status: LineupStatus;
  pitcherName: string | null;
  pitcherHand: "L" | "R" | "S" | null;
  lineup: LineupSpot[];
};

export type RotowireGame = {
  away: RotowireTeam;
  home: RotowireTeam;
  umpire: string | null;
  weatherText: string | null;
  weather: WeatherSnap | null;
};

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

function decode(html: string): string {
  return html
    .replace(/&nbsp;/g, " ")
    .replace(/&/g, "&")
    .replace(/&deg;/g, "°")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function strip(html: string): string {
  return decode(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function batOf(raw: string | undefined): "L" | "R" | "S" | null {
  const c = (raw ?? "").trim().toUpperCase();
  return c === "L" || c === "R" || c === "S" ? c : null;
}

function parseList(listHtml: string): { status: LineupStatus; pitcherName: string | null; pitcherHand: "L" | "R" | "S" | null; lineup: LineupSpot[] } {
  const statusRaw = /lineup__status[^"]*is-(confirmed|expected)/i.exec(listHtml)?.[1] ?? "";
  const status: LineupStatus = statusRaw === "confirmed" ? "confirmed" : statusRaw === "expected" ? "expected" : "none";
  const pitcherChunk = /lineup__player-highlight[\s\S]*?<\/li>/.exec(listHtml)?.[0] ?? "";
  const pitcherName = /<a[^>]*>([^<]+)<\/a>/.exec(pitcherChunk)?.[1]?.trim() ?? null;
  const pitcherHand = batOf(/lineup__throws[^>]*>([^<]+)/.exec(pitcherChunk)?.[1]);
  const lineup: LineupSpot[] = [];
  const re = /<li class="lineup__player">([\s\S]*?)<\/li>/g;
  let m: RegExpExecArray | null;
  let slot = 0;
  while ((m = re.exec(listHtml))) {
    slot += 1;
    const chunk = m[1];
    const pos = /lineup__pos[^>]*>([^<]+)/.exec(chunk)?.[1]?.trim() ?? "";
    const name =
      /title="([^"]+)"/.exec(chunk)?.[1]?.trim() ||
      /<a[^>]*>([^<]+)<\/a>/.exec(chunk)?.[1]?.trim() ||
      "";
    const batSide = batOf(/lineup__bats[^>]*>([^<]+)/.exec(chunk)?.[1]);
    if (!name) continue;
    lineup.push({ slot, playerId: null, name, pos, batSide });
  }
  return { status, pitcherName, pitcherHand, lineup };
}

function parseWeather(text: string | null, elevationFt = 0): WeatherSnap | null {
  if (!text) return null;
  const temp = /(-?\d+)\s*°/.exec(text)?.[1];
  const wind = /Wind\s+(\d+)\s*mph/i.exec(text)?.[1];
  const tempF = temp ? Number(temp) : null;
  const windMph = wind ? Number(wind) : null;
  const { carry, label } = windCarry({
    windMph,
    windFromDeg: null,
    azimuth: null,
    tempF,
    elevationFt,
  });
  return {
    tempF,
    windMph,
    windDir: null,
    windLabel: text.replace(/\s+/g, " ").trim() || label,
    carry,
  };
}

function parseBoxes(html: string): RotowireGame[] {
  const chunks = html.split(/class="[^"]*lineup__box/);
  const games: RotowireGame[] = [];
  for (const chunk of chunks.slice(1)) {
    const abbrs = [...chunk.matchAll(/lineup__abbr[^>]*>([^<]+)/g)].map((m) => normAbbr(strip(m[1])));
    const visit = /<ul class="lineup__list is-visit">[\s\S]*?<\/ul>/.exec(chunk)?.[0] ?? "";
    const home = /<ul class="lineup__list is-home">[\s\S]*?<\/ul>/.exec(chunk)?.[0] ?? "";
    if (!visit || !home || abbrs.length < 2) continue;
    const awayParsed = parseList(visit);
    const homeParsed = parseList(home);
    const umpireRaw = /lineup__umpire[^>]*>([\s\S]*?)<\/div>/.exec(chunk)?.[1] ?? "";
    const umpireText = strip(umpireRaw)
      .replace(/^Umpire:\s*/i, "")
      .replace(/\s*\d+(?:\.\d+)?\s*R\/G.*$/i, "")
      .replace(/\s+/g, " ")
      .trim();
    const umpire = !umpireText || /not announced/i.test(umpireText) ? null : umpireText;
    const weatherRaw = /lineup__weather-text[^>]*>([\s\S]*?)<\/div>/.exec(chunk)?.[1] ?? "";
    const weatherText = strip(weatherRaw) || null;
    games.push({
      away: {
        abbr: abbrs[0],
        status: awayParsed.status,
        pitcherName: awayParsed.pitcherName,
        pitcherHand: awayParsed.pitcherHand,
        lineup: awayParsed.lineup,
      },
      home: {
        abbr: abbrs[1],
        status: homeParsed.status,
        pitcherName: homeParsed.pitcherName,
        pitcherHand: homeParsed.pitcherHand,
        lineup: homeParsed.lineup,
      },
      umpire,
      weatherText,
      weather: parseWeather(weatherText),
    });
  }
  return games;
}

export async function loadRotowireLineups(date: string): Promise<RotowireGame[]> {
  return cached(`rw:${date}:v3`, 6 * 60_000, () => fetchLineups(date));
}

async function fetchLineups(date: string): Promise<RotowireGame[]> {
  const urls = [
    `https://www.rotowire.com/baseball/daily-lineups.php?date=${date}`,
    "https://www.rotowire.com/baseball/daily-lineups.php",
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "text/html", "User-Agent": UA },
        signal: AbortSignal.timeout(14000),
      });
      if (!res.ok) continue;
      const html = await res.text();
      const games = parseBoxes(html);
      if (games.length) return games;
    } catch {
      /* try next */
    }
  }
  return [];
}

export function matchLineupSpot<T extends { name: string }>(spot: LineupSpot, pool: T[]): T | null {
  return pool.find((row) => namesMatch(row.name, spot.name)) ?? null;
}

export function rwByAbbr(games: RotowireGame[]): Map<string, RotowireTeam & { umpire: string | null; weather: WeatherSnap | null; weatherText: string | null }> {
  const map = new Map<string, RotowireTeam & { umpire: string | null; weather: WeatherSnap | null; weatherText: string | null }>();
  for (const g of games) {
    map.set(g.away.abbr, { ...g.away, umpire: g.umpire, weather: g.weather, weatherText: g.weatherText });
    map.set(g.home.abbr, { ...g.home, umpire: g.umpire, weather: g.weather, weatherText: g.weatherText });
  }
  return map;
}

export function expectedPa(slot: number): number {
  if (slot <= 2) return 4.4;
  if (slot <= 5) return 4.15;
  if (slot <= 7) return 3.85;
  return 3.55;
}
