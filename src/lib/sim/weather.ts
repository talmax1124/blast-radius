import type { NflGameIn, NflPlayerIn } from "./nfl.ts";

/**
 * Weather at kickoff, and what it does to an NFL game before the sim plays it.
 *
 * Sizes follow the public research on NFL weather splits (wind is the one that matters):
 * - wind: passing efficiency falls once sustained wind passes about 10 mph, and faster past 15;
 *   totals drop roughly 1 point per 3 mph above 10, and teams lean on the run;
 * - rain or snow: small drops in passing and scoring, a little more running;
 * - cold: below about 25°F scoring dips slightly. Heat barely moves anything.
 * A closed or domed stadium gets no adjustment. Effects are capped so a forecast error cannot gut a projection.
 */

export type Weather = {
  dome: boolean;
  tempF: number;
  windMph: number;
  gustMph?: number;
  /** Precipitation in the kickoff hours, inches per hour. */
  precipIn: number;
  snow?: boolean;
};

export type WeatherEffect = {
  /** Multiplier on passing and receiving yards and passing touchdowns. */
  pass: number;
  /** Multiplier on pass attempts and targets (they fall less than yards). */
  volume: number;
  /** Multiplier on rushing attempts. */
  rush: number;
  /** Points to add to the game total (negative in bad weather). */
  totalPts: number;
  notes: string[];
};

const NONE: WeatherEffect = { pass: 1, volume: 1, rush: 1, totalPts: 0, notes: [] };

export function nflWeatherEffect(w: Weather | null | undefined): WeatherEffect {
  if (!w) return NONE;
  if (w.dome) return { ...NONE, notes: ["indoors"] };
  let pass = 1;
  let totalPts = 0;
  const notes: string[] = [];

  // Gusts count for a third of their excess over sustained wind.
  const wind = w.windMph + Math.max(0, (w.gustMph ?? w.windMph) - w.windMph) / 3;
  if (wind > 10) {
    const over = Math.min(wind, 35) - 10;
    const fast = Math.max(0, Math.min(wind, 35) - 15);
    pass *= 1 - 0.008 * over - 0.007 * fast;
    totalPts -= over / 3;
    notes.push(`wind ${Math.round(wind)} mph`);
  }
  if (w.precipIn >= 0.02) {
    const heavy = w.precipIn >= 0.1;
    if (w.snow) {
      pass *= heavy ? 0.9 : 0.95;
      totalPts -= heavy ? 3 : 1.5;
      notes.push(heavy ? "heavy snow" : "snow");
    } else {
      pass *= heavy ? 0.94 : 0.97;
      totalPts -= heavy ? 2 : 1;
      notes.push(heavy ? "heavy rain" : "rain");
    }
  }
  if (w.tempF < 25) {
    pass *= 0.97;
    totalPts -= 1;
    notes.push(`${Math.round(w.tempF)}°F`);
  }
  pass = Math.max(0.72, pass);
  totalPts = Math.max(-9, totalPts);
  const lost = 1 - pass;
  return {
    pass,
    volume: 1 - lost * 0.45,
    // About half of the lost dropbacks come back as runs.
    rush: 1 + lost * 0.5,
    totalPts,
    notes,
  };
}

/** Apply the effect to a game: the total moves, passing shrinks, and carries pick up some of the slack. */
export function applyNflWeather(game: NflGameIn, effect: WeatherEffect): NflGameIn {
  if (effect.pass === 1 && effect.totalPts === 0 && effect.rush === 1) return game;
  const ptsK = game.total > 0 ? (game.total + effect.totalPts) / game.total : 1;
  const players = game.players.map((p): NflPlayerIn => {
    const ypc = p.rushAtt ? (p.rushYd ?? 0) / p.rushAtt : 0;
    const rushAtt = p.rushAtt != null ? p.rushAtt * effect.rush : undefined;
    return {
      ...p,
      passAtt: p.passAtt != null ? p.passAtt * effect.volume : undefined,
      passYd: p.passYd != null ? p.passYd * effect.pass : undefined,
      passTd: p.passTd != null ? p.passTd * effect.pass * ptsK : undefined,
      targets: p.targets != null ? p.targets * effect.volume : undefined,
      rec: p.rec != null ? p.rec * effect.volume : undefined,
      recYd: p.recYd != null ? p.recYd * effect.pass : undefined,
      recTd: p.recTd != null ? p.recTd * effect.pass * ptsK : undefined,
      rushAtt,
      // Extra carries come at a slightly worse rate than the planned ones.
      rushYd: rushAtt != null ? rushAtt * ypc * (effect.rush > 1 ? 1 - (effect.rush - 1) * 0.5 : 1) : p.rushYd,
      rushTd: p.rushTd != null ? p.rushTd * ptsK : undefined,
    };
  });
  return { ...game, total: Math.max(20, game.total + effect.totalPts), players };
}

/**
 * Home stadiums: latitude, longitude, and whether the roof is closed or fixed.
 * Retractable roofs count as closed in bad weather only, which the caller decides; here they are marked `retractable`.
 */
export const NFL_STADIUMS: Record<string, { lat: number; lon: number; roof: "open" | "dome" | "retractable" }> = {
  ARI: { lat: 33.5276, lon: -112.2626, roof: "retractable" },
  ATL: { lat: 33.7554, lon: -84.4009, roof: "retractable" },
  BAL: { lat: 39.278, lon: -76.6227, roof: "open" },
  BUF: { lat: 42.7738, lon: -78.787, roof: "open" },
  CAR: { lat: 35.2258, lon: -80.8528, roof: "open" },
  CHI: { lat: 41.8623, lon: -87.6167, roof: "open" },
  CIN: { lat: 39.0954, lon: -84.516, roof: "open" },
  CLE: { lat: 41.5061, lon: -81.6995, roof: "open" },
  DAL: { lat: 32.7473, lon: -97.0945, roof: "retractable" },
  DEN: { lat: 39.7439, lon: -105.0201, roof: "open" },
  DET: { lat: 42.34, lon: -83.0456, roof: "dome" },
  GB: { lat: 44.5013, lon: -88.0622, roof: "open" },
  HOU: { lat: 29.6847, lon: -95.4107, roof: "retractable" },
  IND: { lat: 39.7601, lon: -86.1639, roof: "retractable" },
  JAX: { lat: 30.3239, lon: -81.6373, roof: "open" },
  KC: { lat: 39.0489, lon: -94.4839, roof: "open" },
  LV: { lat: 36.0909, lon: -115.1833, roof: "dome" },
  LAC: { lat: 33.9535, lon: -118.3392, roof: "dome" },
  LAR: { lat: 33.9535, lon: -118.3392, roof: "dome" },
  MIA: { lat: 25.958, lon: -80.2389, roof: "open" },
  MIN: { lat: 44.9737, lon: -93.2575, roof: "dome" },
  NE: { lat: 42.0909, lon: -71.2643, roof: "open" },
  NO: { lat: 29.9511, lon: -90.0812, roof: "dome" },
  NYG: { lat: 40.8135, lon: -74.0745, roof: "open" },
  NYJ: { lat: 40.8135, lon: -74.0745, roof: "open" },
  PHI: { lat: 39.9008, lon: -75.1675, roof: "open" },
  PIT: { lat: 40.4468, lon: -80.0158, roof: "open" },
  SF: { lat: 37.403, lon: -121.97, roof: "open" },
  SEA: { lat: 47.5952, lon: -122.3316, roof: "open" },
  TB: { lat: 27.9759, lon: -82.5033, roof: "open" },
  TEN: { lat: 36.1665, lon: -86.7713, roof: "open" },
  WSH: { lat: 38.9077, lon: -76.8645, roof: "open" },
};
