import type { FeedObject, ResearchSport } from "./workbench";
export const LIVE_POLL_MS = 15_000;
export const LIVE_CACHE_MS = 10_000;
export function pollInterval(state: string | undefined, running = true): number | false {
  return !running ? false : state === "in" ? LIVE_POLL_MS : state === "post" ? 300_000 : 60_000;
}
export function isStale(fetchedAt: string | undefined, interval: number, now = Date.now()) {
  const stamp = Date.parse(fetchedAt ?? "");
  return !Number.isFinite(stamp) || now - stamp > Math.max(45_000, interval * 2);
}
const array = (v: unknown): FeedObject[] =>
  Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : [];
const text = (v: unknown): string =>
  typeof v === "string" || typeof v === "number" ? String(v) : "";
const number = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
export type LivePlay = {
  id: string;
  text: string;
  period: string;
  clock: string;
  at: string;
  scoring: boolean;
  homeScore: string;
  awayScore: string;
  sequence: number;
  atBat: string;
  pitch: { x: number; y: number; velocity: number | null; kind: string; count: string } | null;
  start: number | null;
  end: number | null;
};
export type LiveData = {
  plays: LivePlay[];
  zone: { x: number; y: number; width: number; height: number } | null;
  situation: {
    balls: number | null;
    strikes: number | null;
    outs: number | null;
    bases: (boolean | null)[];
    possession: string;
    down: string;
  };
  winProbability: { playId: string; home: number }[];
  period: string;
};
export function normalizeLive(raw: FeedObject, sport: ResearchSport): LiveData {
  const drives = [
    ...array(raw.drives?.previous),
    ...(raw.drives?.current ? [raw.drives.current] : []),
  ];
  const plays = new Map<string, LivePlay>();
  const sourcePlays = [...array(raw.plays), ...drives.flatMap((d) => array(d.plays))];
  for (const [index, p] of sourcePlays.entries()) {
    if (!p.id || !p.text) continue;
    const x = number(p.pitchCoordinate?.x),
      y = number(p.pitchCoordinate?.y);
    const start = number(p.start?.yardsToEndzone),
      end =
        p.start?.team?.id && p.end?.team?.id && p.start.team.id !== p.end.team.id
          ? null
          : number(p.end?.yardsToEndzone);
    plays.set(text(p.id), {
      id: text(p.id),
      text: text(p.text),
      period: text(p.period?.displayValue || p.period?.number),
      clock: text(p.clock?.displayValue),
      at: text(p.wallclock),
      scoring: p.scoringPlay === true,
      homeScore: text(p.homeScore),
      awayScore: text(p.awayScore),
      // Baseball sequenceNumber resets each at-bat. Preserve feed order instead.
      sequence: index,
      atBat: text(p.atBatId),
      pitch:
        x !== null && y !== null && (p.summaryType === "P" || p.pitchType != null)
          ? {
              x,
              y,
              velocity: number(p.pitchVelocity),
              kind: text(p.pitchType?.text),
              count: `${p.resultCount?.balls ?? "—"}–${p.resultCount?.strikes ?? "—"}`,
            }
          : null,
      start: start !== null && start >= 0 && start <= 100 ? start : null,
      end: end !== null && end >= 0 && end <= 100 ? end : null,
    });
  }
  const s = raw.situation ?? {};
  const zones = array(raw.rosters)
    .flatMap((t) => array(t.roster))
    .flatMap((p) => array(p.athlete?.hotZones))
    .find((h) => array(h.zones).some((z) => z.zoneId === 1));
  const cells = array(zones?.zones).filter(
    (z) =>
      z.zoneId >= 1 &&
      z.zoneId <= 9 &&
      [z.xMin, z.xMax, z.yMin, z.yMax].every((v) => number(v) !== null),
  );
  let zone: LiveData["zone"] = null;
  if (sport === "mlb" && cells.length === 9) {
    const x = Math.min(...cells.map((c) => c.xMin)),
      y = Math.min(...cells.map((c) => c.yMin));
    zone = {
      x,
      y,
      width: Math.max(...cells.map((c) => c.xMax)) - x,
      height: Math.max(...cells.map((c) => c.yMax)) - y,
    };
  }
  const status = array(raw.header?.competitions)[0]?.status;
  return {
    plays: [...plays.values()].sort((a, b) => b.sequence - a.sequence).slice(0, 300),
    zone,
    situation: {
      balls: number(s.balls),
      strikes: number(s.strikes),
      outs: number(s.outs),
      bases: [s.onFirst, s.onSecond, s.onThird].map((v) => (typeof v === "boolean" ? v : null)),
      possession: text(s.possessionText ?? s.possession),
      down: text(s.downDistanceText),
    },
    winProbability: array(raw.winprobability)
      .filter(
        (w) =>
          number(w.homeWinPercentage) !== null &&
          w.homeWinPercentage >= 0 &&
          w.homeWinPercentage <= 1,
      )
      .map((w) => ({ playId: text(w.playId), home: w.homeWinPercentage }))
      .slice(-300),
    period: text(status?.type?.detail ?? status?.period),
  };
}
export type VenueMap = {
  name: string;
  address: string;
  image: string;
  indoor: boolean | null;
  lat: number | null;
  lon: number | null;
  source: string;
};
export function normalizeVenue(raw: FeedObject): VenueMap {
  const v = raw.gameInfo?.venue ?? array(raw.header?.competitions)[0]?.venue ?? {};
  const image = text(array(v.images)[0]?.href);
  return {
    name: text(v.fullName),
    address: [v.address?.city, v.address?.state, v.address?.country].filter(Boolean).join(", "),
    image: /^https:\/\/a\.espncdn\.com\//.test(image) ? image : "",
    indoor: typeof v.indoor === "boolean" ? v.indoor : null,
    lat: null,
    lon: null,
    source: "ESPN",
  };
}
export function matchMlbVenue(venues: FeedObject[], name: string) {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const matches = venues.filter((v) => normalize(text(v.name)) === normalize(name));
  if (matches.length !== 1) return null;
  const c = matches[0].location?.defaultCoordinates;
  return number(c?.latitude) !== null &&
    number(c?.longitude) !== null &&
    Math.abs(c.latitude) <= 90 &&
    Math.abs(c.longitude) <= 180
    ? { lat: c.latitude as number, lon: c.longitude as number }
    : null;
}
export function mapUrls(lat: number, lon: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 85 || Math.abs(lon) > 180)
    return null;
  const bbox = [lon - 0.012, lat - 0.008, lon + 0.012, lat + 0.008]
    .map((n) => n.toFixed(6))
    .join(",");
  return {
    embed: `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat},${lon}`,
    full: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`,
  };
}
