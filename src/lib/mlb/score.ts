import { familyMix, mixProfile, primaryOf } from "./pitches.ts";
import type {
  BatterSeason,
  Factor,
  Lean,
  PitcherCard,
  PitchTypeRow,
  PropEdge,
  RecencyFlag,
  SaberCard,
  SplitCard,
  WeatherSnap,
} from "./types.ts";
import { clamp, formatHourEt, formatShortDate } from "./parse.ts";
import { parkHandHr, type Roof } from "./parks.ts";

export function leanFrom(score: number): Lean {
  if (score >= 78) return "smash";
  if (score >= 66) return "strong";
  if (score >= 54) return "lean";
  return "spec";
}

function unit(value: number, lo: number, hi: number): number {
  if (hi === lo) return 0.5;
  return clamp((value - lo) / (hi - lo), 0, 1);
}

export function isoOf(season: BatterSeason): number {
  return season.iso || clamp(season.slg - season.avg, 0, 1);
}

export type MatchupCtx = {
  pitcher: PitcherCard | null;
  parkHr: number;
  parkHits: number;
  parkK: number;
  parkSb: number;
  weather: WeatherSnap | null;
  lineupSlot: number;
  platoon: number;
  saber: SaberCard | null;
  vsPitches: PitchTypeRow[];
  isHome: boolean;
  edge: PropEdge | null;
  flags?: RecencyFlag[];
  reverse?: boolean;
  dayNight?: string;
  roof?: Roof;
  venueId?: number;
  batSide?: "L" | "R" | "S" | null;
  gameHour?: number | null;
  dn?: { d: SplitCard | null; n: SplitCard | null } | null;
  hrHours?: number[];
  lastHrDate?: string | null;
  leagueDayHrPa?: number;
  leagueNightHrPa?: number;
  leagueHours?: number[];
};

function saberOr(value: number | null | undefined, lo: number, hi: number, fallback = 0.45): number {
  if (value == null) return fallback;
  return unit(value, lo, hi);
}

export function pitchMixHr(arsenal: PitchTypeRow[] | null | undefined, vs: PitchTypeRow[] | null | undefined) {
  return mixProfile(arsenal, vs);
}

function handLabel(code: "vl" | "vr" | null | undefined): string {
  if (code === "vl") return "LHP";
  if (code === "vr") return "RHP";
  return "hand";
}

function haLabel(code: "h" | "a" | null | undefined): string {
  if (code === "h") return "home";
  if (code === "a") return "away";
  return "split";
}

export function reversePlatoon(
  bat: "L" | "R" | "S" | null | undefined,
  throwH: "L" | "R" | "S" | null | undefined,
  split: SplitCard | null | undefined,
): boolean {
  if (!bat || !throwH || throwH === "S" || bat === "S") return false;
  if (bat !== throwH) return false;
  if (!split || split.pa < 40) return false;
  return split.slg >= 0.455 && split.iso >= 0.145;
}

function platoonFactor(ctx: MatchupCtx): { score: number; detail: string } {
  const split = ctx.edge?.vsHand;
  if (split && split.pa >= 25) {
    const slgU = unit(split.slg, 0.32, 0.62);
    const isoU = unit(split.iso, 0.08, 0.32);
    const tagged = ctx.reverse ? "Reverse+ · " : "";
    return {
      score: 0.62 * slgU + 0.38 * isoU,
      detail: `${tagged}${split.slg.toFixed(3)} SLG vs ${handLabel(ctx.edge?.vsHandCode)} · ${split.pa} PA`,
    };
  }
  if (ctx.reverse) {
    return { score: Math.max(ctx.platoon, 0.62), detail: "Reverse platoon" };
  }
  return { score: ctx.platoon, detail: platoonDetail(ctx.platoon) };
}

function haFactor(ctx: MatchupCtx, key: "avg" | "ops" | "slg"): { score: number; detail: string } {
  const split = ctx.edge?.ha;
  if (!split || split.pa < 30) {
    return { score: 0.5, detail: ctx.isHome ? "Home" : "Away" };
  }
  const value = split[key];
  const lo = key === "avg" ? 0.21 : key === "ops" ? 0.62 : 0.35;
  const hi = key === "avg" ? 0.33 : key === "ops" ? 0.95 : 0.62;
  return {
    score: unit(value, lo, hi),
    detail: `${value.toFixed(3)} ${key.toUpperCase()} ${haLabel(ctx.edge?.haCode)} · ${split.pa} PA`,
  };
}

export function isOpener(pitcher: PitcherCard | null | undefined): boolean {
  if (!pitcher) return false;
  if (pitcher.opener) return true;
  const gs = pitcher.gamesStarted || 0;
  const gp = pitcher.gamesPlayed || gs;
  const ip = pitcher.ip || 0;
  const recentIp = pitcher.recentIp;
  if (recentIp != null && recentIp > 0 && recentIp < 3.15) return true;
  if (gs <= 4 && ip < 28) return true;
  if (gs >= 1 && ip / Math.max(gs, 1) < 3.4 && gs < 15) return true;
  if (gp >= 8 && gs <= 3) return true;
  return false;
}

/** Short starters and openers leak runs. Used to boost counting, not to skip K overs. */
export function isShortStart(pitcher: PitcherCard | null | undefined): boolean {
  if (!pitcher) return false;
  if (isOpener(pitcher)) return true;
  if (pitcher.recentIp != null && pitcher.recentIp > 0 && pitcher.recentIp < 4.35) return true;
  const gs = pitcher.gamesStarted || 0;
  if (gs >= 4 && pitcher.ip / Math.max(gs, 1) < 4.45) return true;
  return false;
}

/** Soft pitchers inflate counting overs; Wheeler/deGrom/Gilbert crush them. Openers are not aces. */
export function aceSuppress(pitcher: PitcherCard | null): { factor: number; score: number; detail: string } {
  if (!pitcher || !pitcher.k9) return { factor: 1, score: 0.55, detail: "No probable" };
  if (isOpener(pitcher)) {
    const ipBit = pitcher.recentIp != null ? `${pitcher.recentIp.toFixed(1)} IP/app` : `${pitcher.gamesStarted} GS`;
    return { factor: 1.05, score: 0.64, detail: `Opener · ${ipBit}` };
  }
  const k9 = pitcher.k9;
  const whip = pitcher.whip || 1.25;
  const xera = pitcher.xera ?? pitcher.era ?? 4.2;
  const ace = clamp(0.5 * unit(k9, 7.0, 12.2) + 0.28 * unit(5.4 - xera, 0.3, 2.8) + 0.22 * unit(1.5 - whip, 0.1, 0.75), 0, 1);
  const factor = clamp(1.08 - ace * 0.7, 0.38, 1.06);
  const eraBit = pitcher.xera != null ? `${pitcher.xera.toFixed(2)} xERA` : `${(pitcher.era || 0).toFixed(2)} ERA`;
  return { factor, score: unit(factor, 0.38, 1.06), detail: `${k9.toFixed(1)} K/9 · ${eraBit}` };
}

export function isAcePitcher(k9: number | null | undefined, xera: number | null | undefined, _whip?: number | null): boolean {
  const k = k9 ?? 0;
  if (!k) return false;
  if (k >= 9.5) return true;
  if (k >= 9.0 && xera != null && xera <= 3.05) return true;
  return false;
}

export type WeekForm = { hr: number; pa: number; games: number; avg?: number; hits?: number; tb?: number; rbi?: number; runs?: number };

export function hrDrought(
  form: { hr?: number; pa?: number; games?: number; weekHr?: number; weekPa?: number; weekGames?: number } | null | undefined,
): boolean {
  const hr = form?.weekHr ?? form?.hr ?? 0;
  const pa = form?.weekPa ?? form?.pa ?? 0;
  return pa >= 22 && hr === 0;
}

export function recencyFlags(season: BatterSeason, week: WeekForm | null | undefined): RecencyFlag[] {
  const flags: RecencyFlag[] = [];
  if (!week) return flags;
  const wPa = week.pa ?? 0;
  const wHr = week.hr ?? 0;
  const wAvg = week.avg ?? 0;
  if (wPa > 0 && wPa < 12) flags.push("thin");
  if (hrDrought(week)) flags.push("drought");
  if (wPa >= 12) {
    const seasonHrPa = season.hr / Math.max(season.pa, 1);
    const weekHrPa = wHr / Math.max(wPa, 1);
    if (wAvg >= season.avg + 0.048 || weekHrPa >= seasonHrPa + 0.035) flags.push("hot");
    else if (wAvg <= season.avg - 0.04 && wPa >= 14) flags.push("cold");
  }
  return flags;
}

function recencyBoost(flags: RecencyFlag[] | undefined, kind: "hr" | "count"): number {
  const list = flags ?? [];
  const hot = list.includes("hot");
  const cold = list.includes("cold");
  if (kind === "hr") {
    if (hot) return 1.05;
    if (cold) return 0.94;
    return 1;
  }
  if (hot) return 1.04;
  if (cold) return 0.84;
  return 1;
}

export function expectedPaOf(slot: number): number {
  if (slot <= 2) return 4.4;
  if (slot <= 5) return 4.15;
  if (slot <= 7) return 3.85;
  return 3.55;
}

/** Launch angle peaks for HR around 25–32°. Ground balls and pop-ups do not go out. */
export function launchHrWindow(angle: number | null | undefined): { score: number; detail: string } {
  if (angle == null || !Number.isFinite(angle)) return { score: 0.5, detail: "—" };
  const dist = Math.abs(angle - 28);
  return {
    score: clamp(1 - dist / 22, 0.08, 1),
    detail: `${angle.toFixed(1)}°`,
  };
}

/** Pull-side fly balls are the HR shape. Typical is ~0.10; mashers sit 0.15+. */
export function pullAirScore(fb: number | null | undefined, pull: number | null | undefined): { score: number; detail: string; mult: number } {
  if (fb == null && pull == null) return { score: 0.5, detail: "—", mult: 1 };
  const f = fb ?? 24;
  const p = pull ?? 40;
  const air = (f / 100) * (p / 100);
  return {
    score: unit(air, 0.055, 0.175),
    detail: `${f.toFixed(0)}% FB · ${p.toFixed(0)}% pull`,
    mult: clamp(0.88 + air * 1.35, 0.88, 1.2),
  };
}

/**
 * Shrink last-week HR rate toward the season rate. A 0-HR week is noise for a
 * 35-HR bat — it is not a 0.06 form score.
 */
export function bayesHrPa(
  season: BatterSeason,
  week: WeekForm | null | undefined,
  recentHrPa: number | null,
): { rate: number; form: number; detail: string } {
  const seasonRate = season.hr / Math.max(season.pa, 1);
  const weekPa = week?.pa ?? 0;
  const weekHr = week?.hr ?? 0;
  const recPa = weekPa >= 8 ? weekPa : recentHrPa != null ? 28 : 0;
  const recHr = weekPa >= 8 ? weekHr : recentHrPa != null ? recentHrPa * recPa : 0;
  const w = recPa > 0 ? clamp(recPa / 52, 0, 0.3) : 0;
  const recRate = recPa > 0 ? recHr / recPa : seasonRate;
  const rate = (1 - w) * seasonRate + w * recRate;
  const detail =
    weekPa >= 8
      ? `${weekHr} HR / ${weekPa} PA last week`
      : recentHrPa != null
        ? `${(recentHrPa * 100).toFixed(1)}% PA last 10`
        : `${season.hr} HR season`;
  return { rate, form: unit(rate, 0.018, 0.075), detail };
}

/** ISO maps to HR/PA at ~0.28. A .250 ISO bat is a ~0.070 HR/PA threat. */
export function isoHrPa(iso: number): number {
  return clamp(iso * 0.28, 0.004, 0.12);
}

/** HR/9 plus fly-ball tilt. Ground-ball aces with 0.7 HR/9 are not the same as fly-ball 1.6s. */
export function pitcherHrEnv(hr9: number, goAo: number | null | undefined): { score: number; detail: string } {
  const hrU = unit(hr9, 0.55, 1.85);
  const flyU = unit(1.5 - (goAo ?? 1), 0.15, 1.05);
  return {
    score: clamp(0.68 * hrU + 0.32 * flyU, 0, 1),
    detail: `${hr9.toFixed(2)} HR/9 · ${(goAo ?? 1).toFixed(2)} GO/AO`,
  };
}

/** 97+ mph four-seamers cut HR; 92 mph heat is liftable. */
export function fbVeloHr(arsenal: PitchTypeRow[] | null | undefined): { score: number; detail: string; mult: number } {
  const heat = (arsenal ?? []).filter((p) => p.family === "heat" && p.velo != null && p.velo > 0);
  if (!heat.length) return { score: 0.5, detail: "—", mult: 1 };
  const wVelo = heat.reduce((s, p) => s + (p.velo ?? 0) * p.usage, 0);
  const wUse = heat.reduce((s, p) => s + p.usage, 0) || 1;
  const velo = wVelo / wUse;
  return {
    score: unit(97.5 - velo, 0.4, 6),
    detail: `${velo.toFixed(1)} mph FB`,
    mult: clamp(1.08 - (velo - 93) / 50, 0.9, 1.08),
  };
}

/** Season HR rate vs that hand — more HR-specific than SLG. */
export function vsHandHrRate(split: SplitCard | null | undefined): { score: number; rate: number | null; detail: string } {
  if (!split || split.pa < 40) return { score: 0.5, rate: null, detail: "—" };
  const rate = split.hr / Math.max(split.pa, 1);
  return {
    score: unit(rate, 0.015, 0.08),
    rate,
    detail: `${split.hr} HR / ${split.pa} PA vs hand`,
  };
}

/** Barrels + launch window + pull-air + hard hit as one quality 0–1. */
export function contactShape(opts: { barrel: number; launch: number; air: number; hard: number }): number {
  return clamp(0.42 * opts.barrel + 0.22 * opts.launch + 0.2 * opts.air + 0.16 * opts.hard, 0.05, 0.98);
}

export function isNightSlate(dayNight: string | undefined, gameHour: number | null | undefined): boolean {
  if (dayNight === "day") return false;
  if (dayNight === "night") return true;
  if (gameHour == null) return true;
  return gameHour >= 17 || gameHour < 5;
}

function hourDist(a: number, b: number): number {
  const d = Math.abs(((a % 24) + 24) % 24 - ((b % 24) + 24) % 24);
  return Math.min(d, 24 - d);
}

/**
 * Player day/night HR/PA, shrunk toward season + league. Night games run a bit
 * louder league-wide (~5–8%), but the live tell is the bat's own split:
 * Alvarez is a night masher, Judge has been louder in the day this year.
 */
export function nightHrFit(opts: {
  dn?: { d: SplitCard | null; n: SplitCard | null } | null;
  dayNight?: string;
  gameHour?: number | null;
  seasonHrPa: number;
  leagueDayHrPa?: number;
  leagueNightHrPa?: number;
  lastHrDate?: string | null;
}): { score: number; mult: number; detail: string; rate: number | null; night: boolean } {
  const night = isNightSlate(opts.dayNight, opts.gameHour);
  const leagueDay = opts.leagueDayHrPa ?? 0.032;
  const leagueNight = opts.leagueNightHrPa ?? 0.035;
  const leagueRate = night ? leagueNight : leagueDay;
  const split = night ? opts.dn?.n : opts.dn?.d;
  const other = night ? opts.dn?.d : opts.dn?.n;
  const label = night ? "at night" : "in the day";
  const last = opts.lastHrDate ? ` · last yard ${formatShortDate(opts.lastHrDate)}` : "";

  if (!split || split.pa < 50) {
    const mult = night ? 1.05 : 0.96;
    return {
      score: night ? 0.56 : 0.44,
      mult,
      detail: night ? `Night slate · league +5%${last}` : `Day game · league −4%${last}`,
      rate: null,
      night,
    };
  }

  const rate = split.hr / Math.max(split.pa, 1);
  const w = clamp(split.pa / 220, 0, 0.75);
  const prior = 0.62 * opts.seasonHrPa + 0.38 * leagueRate;
  const shrunk = (1 - w) * prior + w * rate;
  const mult = clamp(shrunk / Math.max(opts.seasonHrPa, 0.018), 0.82, 1.22);
  let detail = `${split.hr} HR / ${split.pa} PA ${label}`;
  if (other && other.pa >= 40) {
    const oRate = other.hr / Math.max(other.pa, 1);
    const lift = rate / Math.max(oRate, 0.008);
    detail += ` · ${lift.toFixed(2)}x vs ${night ? "day" : "night"}`;
  }
  detail += last;
  return {
    score: unit(shrunk, 0.018, 0.075),
    mult,
    detail,
    rate,
    night,
  };
}

/**
 * First-pitch hour of the games this bat actually went yard, matched to
 * tonight's first pitch. Needs 8+ homers; a 3-hour window around first pitch.
 */
export function hrClockFit(
  hours: number[] | null | undefined,
  gameHour: number | null | undefined,
  leagueHours?: number[] | null,
): { score: number; mult: number; detail: string } {
  if (gameHour == null || !hours || hours.length < 8) {
    return { score: 0.5, mult: 1, detail: "—" };
  }
  const window = hours.filter((h) => hourDist(h, gameHour) <= 2).length;
  const share = window / hours.length;
  const league = leagueHours && leagueHours.length >= 40
    ? leagueHours.filter((h) => hourDist(h, gameHour) <= 2).length / leagueHours.length
    : gameHour >= 17 || gameHour < 5
      ? 0.58
      : 0.28;
  const lift = share / Math.max(league, 0.12);
  return {
    score: unit(share, 0.16, 0.72),
    mult: clamp(0.94 + (lift - 1) * 0.16, 0.9, 1.12),
    detail: `${window} of ${hours.length} yards in games starting ~${formatHourEt(gameHour)}`,
  };
}

export function scoreHomeRun(season: BatterSeason, recentHrPa: number | null, ctx: MatchupCtx, week: WeekForm | null = null) {
  const pa = Math.max(season.pa, 1);
  const hrPa = season.hr / pa;
  const iso = isoOf(season);
  const power = unit(hrPa, 0.018, 0.075);
  const isoU = unit(iso, 0.11, 0.34);
  const flags = ctx.flags ?? recencyFlags(season, week);
  const drought = flags.includes("drought") || hrDrought(week);
  const bayes = bayesHrPa(season, week, recentHrPa);
  const hr9 = ctx.edge?.pitcherVsHandHr9 ?? ctx.pitcher?.hr9 ?? 1.15;
  const goAo = ctx.pitcher?.goAo ?? 1.0;
  const env = pitcherHrEnv(hr9, goAo);
  const parkAdj = parkHandHr(ctx.venueId ?? 0, ctx.batSide, ctx.parkHr);
  const park = unit(parkAdj, 88, 118);
  const roof = ctx.roof ?? "open";
  const weather = roof === "dome" ? 0.5 : (ctx.weather?.carry ?? 0.45);
  const weatherDetail = roof === "dome" ? "Dome" : (ctx.weather?.windLabel ?? "No reading");
  const slot = unit(10 - ctx.lineupSlot, 1, 9);
  const saber = ctx.saber;
  const barrel = saberOr(saber?.barrelPa, 1.2, 9.5);
  const xslg = saberOr(saber?.xslg, 0.38, 0.64);
  const xwoba = saberOr(saber?.xwoba, 0.3, 0.42);
  const xIso = saber?.xslg != null && saber?.xba != null ? saber.xslg - saber.xba : iso;
  const xIsoU = unit(xIso, 0.1, 0.32);
  const mix = pitchMixHr(ctx.pitcher?.arsenal, ctx.vsPitches);
  const platoon = platoonFactor(ctx);
  const fb = saberOr(ctx.edge?.fbRate, 18, 38);
  const pull = saberOr(ctx.edge?.pullRate, 32, 52);
  const air = pullAirScore(ctx.edge?.fbRate, ctx.edge?.pullRate);
  const ha = haFactor(ctx, "slg");
  const dueRaw = saber?.xslg != null ? unit(saber.xslg - season.slg + 0.01, -0.06, 0.08) : 0.5;
  const due = drought ? Math.min(dueRaw, 0.42) : dueRaw;
  const ace = aceSuppress(ctx.pitcher);
  const formBoost = recencyBoost(flags, "hr");
  const loudMix = mix.hrMult >= 1.18;
  const launch = launchHrWindow(saber?.launch);
  const hard = saberOr(saber?.hardHit, 28, 55);
  const sweet = saberOr(saber?.sweetSpot, 28, 42);
  const ev = saberOr(saber?.evAvg, 86, 96);
  const evMax = saberOr(saber?.evMax, 108, 118);
  const wrc = saberOr(saber?.wrcPlus, 85, 165);
  const heat = familyMix(ctx.pitcher?.arsenal).heat;
  const heatU = ctx.pitcher?.arsenal?.length ? unit(heat, 28, 68) : 0.5;
  const nightFit = nightHrFit({
    dn: ctx.dn ?? (ctx.edge?.dn && ctx.edge.dnCode ? { d: ctx.edge.dnCode === "d" ? ctx.edge.dn : null, n: ctx.edge.dnCode === "n" ? ctx.edge.dn : null } : null),
    dayNight: ctx.dayNight,
    gameHour: ctx.gameHour,
    seasonHrPa: hrPa,
    leagueDayHrPa: ctx.leagueDayHrPa,
    leagueNightHrPa: ctx.leagueNightHrPa,
    lastHrDate: ctx.lastHrDate,
  });
  const clock = hrClockFit(ctx.hrHours, ctx.gameHour, ctx.leagueHours);
  const velo = fbVeloHr(ctx.pitcher?.arsenal);
  const vsHr = vsHandHrRate(ctx.edge?.vsHand);
  const shape = contactShape({ barrel, launch: launch.score, air: air.score, hard });
  const porch = clamp(park * air.score, 0, 1);
  const handBit = ctx.batSide === "L" ? "LHB" : ctx.batSide === "R" ? "RHB" : "";

  const factors: Factor[] = [
    { key: "power", label: "Power", score: power, detail: `${season.hr} HR · ${(hrPa * 100).toFixed(1)}% PA` },
    { key: "form", label: drought ? "Quiet week" : flags.includes("hot") ? "Hot" : flags.includes("cold") ? "Cold" : "Form", score: bayes.form, detail: bayes.detail },
    { key: "barrel", label: "Barrels/PA", score: barrel, detail: saber?.barrelPa != null ? `${saber.barrelPa.toFixed(1)}%` : "—" },
    { key: "shape", label: "Contact shape", score: shape, detail: `brl/launch/pull-air` },
    { key: "hard", label: "Hard hit", score: hard, detail: saber?.hardHit != null ? `${saber.hardHit.toFixed(0)}%` : "—" },
    { key: "launch", label: "Launch", score: launch.score, detail: launch.detail },
    { key: "xslg", label: "xSLG", score: xslg, detail: saber?.xslg != null ? saber.xslg.toFixed(3) : "—" },
    { key: "xiso", label: "xISO", score: xIsoU, detail: saber?.xslg != null && saber?.xba != null ? xIso.toFixed(3) : iso.toFixed(3) },
    { key: "mix", label: "Pitch mix", score: mix.score, detail: mix.detail },
    { key: "platoon", label: "Platoon", score: platoon.score, detail: platoon.detail },
    { key: "vshr", label: "vs-hand HR", score: vsHr.score, detail: vsHr.detail },
    { key: "air", label: "Pull air", score: air.score, detail: air.detail },
    { key: "iso", label: "ISO", score: isoU, detail: iso.toFixed(3) },
    { key: "pitch", label: "Pitcher HR env", score: env.score, detail: ctx.pitcher ? env.detail : "League" },
    { key: "velo", label: "FB velo", score: velo.score, detail: velo.detail },
    { key: "heat", label: "Opp heat", score: heatU, detail: ctx.pitcher?.arsenal?.length ? `${Math.round(heat)}% FB` : "—" },
    { key: "park", label: "Park", score: park, detail: `${parkAdj} HR factor${handBit ? ` · ${handBit}` : ""}${roof === "dome" ? " · dome" : ""}` },
    { key: "porch", label: "Porch", score: porch, detail: `pull-air × park` },
    { key: "pull", label: "Pull", score: pull, detail: ctx.edge?.pullRate != null ? `${ctx.edge.pullRate.toFixed(0)}%` : "—" },
    { key: "home", label: ctx.isHome ? "Home" : "Away", score: ha.score, detail: ha.detail },
    { key: "night", label: nightFit.night ? "Night HR" : "Day HR", score: nightFit.score, detail: nightFit.detail },
    { key: "clock", label: "HR clock", score: clock.score, detail: clock.detail },
    { key: "weather", label: "Air", score: weather, detail: weatherDetail },
    { key: "xwoba", label: "xwOBA", score: xwoba, detail: saber?.xwoba != null ? saber.xwoba.toFixed(3) : "—" },
    { key: "wrc", label: "wRC+", score: wrc, detail: saber?.wrcPlus != null ? String(Math.round(saber.wrcPlus)) : "—" },
    { key: "ev", label: "Avg EV", score: ev, detail: saber?.evAvg != null ? `${saber.evAvg.toFixed(1)} mph` : "—" },
    { key: "due", label: "Due", score: due, detail: saber?.xslg != null ? `${(saber.xslg - season.slg >= 0 ? "+" : "")}${(saber.xslg - season.slg).toFixed(3)} xSLG-SLG` : "—" },
    { key: "ace", label: "Opp starter", score: ace.score, detail: ace.detail },
    { key: "order", label: "Order", score: slot, detail: `Slot ${ctx.lineupSlot}` },
    { key: "fly", label: "Fly ball", score: fb, detail: ctx.edge?.fbRate != null ? `${ctx.edge.fbRate.toFixed(0)}% FB` : "—" },
    { key: "sweet", label: "Sweet spot", score: sweet, detail: saber?.sweetSpot != null ? `${saber.sweetSpot.toFixed(0)}%` : "—" },
    { key: "evmax", label: "Max EV", score: evMax, detail: saber?.evMax != null ? `${saber.evMax.toFixed(1)} mph` : "—" },
  ];

  const raw =
    0.13 * power +
    0.06 * bayes.form +
    0.12 * barrel +
    0.04 * hard +
    0.05 * launch.score +
    0.04 * xslg +
    0.04 * xIsoU +
    0.07 * mix.score +
    0.05 * platoon.score +
    0.05 * air.score +
    0.03 * isoU +
    0.09 * env.score +
    0.02 * heatU +
    0.08 * park +
    0.04 * vsHr.score +
    0.02 * ha.score +
    0.03 * weather +
    0.02 * wrc +
    0.02 * due +
    0.04 * ace.score +
    0.04 * nightFit.score +
    0.02 * clock.score +
    0.02 * velo.score +
    0.02 * porch +
    0.02 * shape;

  let score = Math.round(clamp(raw * 100 * (loudMix && flags.includes("cold") ? 1 : formBoost), 8, 97));
  if (drought) score = Math.round(clamp(score * 0.96, 8, 94));

  const paExp = expectedPaOf(ctx.lineupSlot);
  const isoRate = isoHrPa(iso);
  const mixedRate =
    vsHr.rate != null ? 0.55 * bayes.rate + 0.25 * vsHr.rate + 0.2 * isoRate : 0.72 * bayes.rate + 0.28 * isoRate;
  const mixTilt = mix.coverage > 0 ? 0.85 + 0.15 * clamp(mix.hrMult, 0.7, 1.3) : 1;

  let impliedHr = clamp(
    mixedRate *
      paExp *
      (0.82 + 0.36 * park) *
      (0.78 + 0.44 * env.score) *
      (0.9 + 0.2 * weather) *
      (0.82 + 0.36 * shape) *
      (0.88 + 0.24 * platoon.score) *
      velo.mult *
      mixTilt *
      nightFit.mult *
      clock.mult *
      (drought ? 0.95 : 1) *
      (0.94 + 0.12 * ace.score) *
      (loudMix && flags.includes("cold") ? 1 : formBoost),
    0.03,
    0.55,
  );
  if (isAcePitcher(ctx.pitcher?.k9, ctx.pitcher?.xera) && !isOpener(ctx.pitcher) && !ctx.reverse) {
    impliedHr *= 0.9;
  }
  if (isShortStart(ctx.pitcher)) impliedHr *= 1.04;
  impliedHr *= 0.88;
  impliedHr = clamp(impliedHr, 0.03, 0.48);

  const hrPct = 1 - Math.exp(-impliedHr);

  const reasons = pickReasons(factors, [
    drought ? bayes.detail : `${season.hr} HR in ${season.pa} PA`,
    ctx.pitcher ? `vs ${ctx.pitcher.name.split(" ").slice(-1)[0]} ${hr9.toFixed(2)} HR/9` : "No probable listed",
    `${parkAdj} park HR factor${handBit ? ` ${handBit}` : ""}`,
  ]);

  return { score, impliedHr, hrPct, factors, reasons, matchup: mix.matchup, mix };
}

function countingForm(season: BatterSeason, recentAvg: number | null, ctx: MatchupCtx, mixScore: number) {
  const flags = ctx.flags ?? [];
  const boost = recencyBoost(flags, "count");
  const mixAdj = 0.7 + 0.3 * mixScore;
  const short = isShortStart(ctx.pitcher) ? 1.1 : 1;
  return clamp(boost * (ctx.reverse ? 1.04 : 1) * mixAdj * short, 0.78, 1.22);
}

export function scoreHits(season: BatterSeason, recentAvg: number | null, ctx: MatchupCtx) {
  const avgU = unit(season.avg, 0.21, 0.33);
  const babip = unit(season.babip || 0.29, 0.26, 0.36);
  const form = recentAvg == null ? avgU : unit(recentAvg, 0.18, 0.4);
  const hits9 = ctx.edge?.pitcherVsHandHits9 ?? ctx.pitcher?.hits9 ?? 8.4;
  const pitch = unit(hits9, 6.2, 10.5);
  const slot = unit(10 - ctx.lineupSlot, 1, 9);
  const xba = saberOr(ctx.saber?.xba, 0.22, 0.33);
  const mix = pitchMixHr(ctx.pitcher?.arsenal, ctx.vsPitches);
  const primary = primaryOf(ctx.pitcher?.arsenal);
  const vs = primary ? ctx.vsPitches.find((row) => row.code === primary.code) : null;
  const mixXba = vs?.xba != null ? unit(vs.xba, 0.22, 0.33) : mix.score;
  const mixDetail = mix.detail !== "No arsenal" ? mix.detail : vs?.xba != null && primary ? `vs ${primary.code} ${vs.xba.toFixed(3)} xBA` : "No split";
  const park = unit(ctx.parkHits, 92, 118);
  const platoon = platoonFactor(ctx);
  const ha = haFactor(ctx, "avg");
  const ld = saberOr(ctx.edge?.ldRate, 16, 28);
  const ace = aceSuppress(ctx.pitcher);
  const tilt = countingForm(season, recentAvg, ctx, mix.dmgMult);
  const factors: Factor[] = [
    { key: "avg", label: "AVG", score: avgU, detail: season.avg.toFixed(3) },
    { key: "xba", label: "xBA", score: xba, detail: ctx.saber?.xba != null ? ctx.saber.xba.toFixed(3) : "—" },
    { key: "mix", label: "vs mix", score: mixXba, detail: mixDetail },
    { key: "platoon", label: "Platoon", score: platoon.score, detail: platoon.detail },
    { key: "form", label: "Last 10", score: form, detail: recentAvg == null ? "Season" : recentAvg.toFixed(3) },
    { key: "pitch", label: "H/9 allowed", score: pitch, detail: ctx.pitcher ? hits9.toFixed(2) : "League" },
    { key: "ace", label: "Opp starter", score: ace.score, detail: ace.detail },
    { key: "park", label: "Park hits", score: park, detail: `${ctx.parkHits} H factor` },
    { key: "home", label: ctx.isHome ? "Home" : "Away", score: ha.score, detail: ha.detail },
    { key: "line", label: "Line drive", score: ld, detail: ctx.edge?.ldRate != null ? `${ctx.edge.ldRate.toFixed(0)}% LD` : "—" },
    { key: "babip", label: "BABIP", score: babip, detail: (season.babip || 0).toFixed(3) },
    { key: "order", label: "Order", score: slot, detail: `Slot ${ctx.lineupSlot}` },
  ];
  const score = Math.round(
    clamp(
      (0.14 * avgU +
        0.11 * xba +
        0.1 * mixXba +
        0.08 * platoon.score +
        0.1 * form +
        0.08 * pitch +
        0.22 * ace.score +
        0.06 * park +
        0.04 * ha.score +
        0.03 * ld +
        0.02 * babip +
        0.02 * slot) *
        100 *
        tilt,
      8,
      96,
    ),
  );
  return { score, factors, reasons: pickReasons(factors, [`${season.avg.toFixed(3)} AVG`, `${season.hits} hits`]), mix };
}

export function scoreTotalBases(season: BatterSeason, ctx: MatchupCtx, recentAvg: number | null = null) {
  const slg = unit(season.slg, 0.35, 0.62);
  const iso = unit(isoOf(season), 0.11, 0.34);
  const park = unit((ctx.parkHr + ctx.parkHits) / 2, 90, 118);
  const hr9 = unit(ctx.edge?.pitcherVsHandHr9 ?? ctx.pitcher?.hr9 ?? 1.15, 0.55, 1.85);
  const xslg = saberOr(ctx.saber?.xslg, 0.38, 0.64);
  const mix = pitchMixHr(ctx.pitcher?.arsenal, ctx.vsPitches);
  const platoon = platoonFactor(ctx);
  const fb = saberOr(ctx.edge?.fbRate, 18, 38);
  const ha = haFactor(ctx, "slg");
  const slot = unit(10 - ctx.lineupSlot, 1, 9);
  const due = ctx.saber?.xslg != null ? unit(ctx.saber.xslg - season.slg + 0.01, -0.06, 0.08) : 0.5;
  const ace = aceSuppress(ctx.pitcher);
  const form = recentAvg == null ? slg : unit(recentAvg, 0.18, 0.4);
  const tilt = countingForm(season, recentAvg, ctx, mix.dmgMult);
  const factors: Factor[] = [
    { key: "slg", label: "SLG", score: slg, detail: season.slg.toFixed(3) },
    { key: "xslg", label: "xSLG", score: xslg, detail: ctx.saber?.xslg != null ? ctx.saber.xslg.toFixed(3) : "—" },
    { key: "mix", label: "Pitch mix", score: mix.score, detail: mix.detail },
    { key: "platoon", label: "Platoon", score: platoon.score, detail: platoon.detail },
    { key: "iso", label: "ISO", score: iso, detail: isoOf(season).toFixed(3) },
    { key: "park", label: "Park", score: park, detail: `HR ${ctx.parkHr} · H ${ctx.parkHits}` },
    { key: "fly", label: "Fly ball", score: fb, detail: ctx.edge?.fbRate != null ? `${ctx.edge.fbRate.toFixed(0)}% FB` : "—" },
    { key: "home", label: ctx.isHome ? "Home" : "Away", score: ha.score, detail: ha.detail },
    { key: "pitch", label: "Pitcher", score: hr9, detail: ctx.pitcher ? `${(ctx.edge?.pitcherVsHandHr9 ?? ctx.pitcher.hr9).toFixed(2)} HR/9` : "League" },
    { key: "ace", label: "Opp starter", score: ace.score, detail: ace.detail },
    { key: "form", label: "Last 10", score: form, detail: recentAvg == null ? "Season" : recentAvg.toFixed(3) },
    { key: "order", label: "Order", score: slot, detail: `Slot ${ctx.lineupSlot}` },
    { key: "due", label: "Due", score: due, detail: ctx.saber?.xslg != null ? `${(ctx.saber.xslg - season.slg >= 0 ? "+" : "")}${(ctx.saber.xslg - season.slg).toFixed(3)} xSLG-SLG` : "—" },
  ];
  const score = Math.round(
    clamp(
      (0.12 * slg +
        0.11 * xslg +
        0.12 * mix.score +
        0.07 * platoon.score +
        0.07 * iso +
        0.06 * park +
        0.04 * fb +
        0.03 * ha.score +
        0.04 * hr9 +
        0.2 * ace.score +
        0.07 * form +
        0.04 * slot +
        0.03 * due) *
        100 *
        tilt,
      8,
      96,
    ),
  );
  return { score, factors, reasons: pickReasons(factors, [`${season.slg.toFixed(3)} SLG`, `${season.tb} TB`]), mix };
}

export function scoreRbi(season: BatterSeason, ctx: MatchupCtx) {
  const rbiPa = season.rbi / Math.max(season.pa, 1);
  const rbiU = unit(rbiPa, 0.08, 0.2);
  const iso = unit(isoOf(season), 0.11, 0.34);
  const heart = ctx.lineupSlot >= 2 && ctx.lineupSlot <= 5 ? 0.85 : ctx.lineupSlot === 1 ? 0.55 : 0.4;
  const table = saberOr(ctx.edge?.teamObp, 0.3, 0.345);
  const park = unit(ctx.parkHits, 92, 118);
  const platoon = platoonFactor(ctx);
  const ace = aceSuppress(ctx.pitcher);
  const mix = pitchMixHr(ctx.pitcher?.arsenal, ctx.vsPitches);
  const tilt = countingForm(season, null, ctx, mix.dmgMult);
  const factors: Factor[] = [
    { key: "rbi", label: "RBI/PA", score: rbiU, detail: rbiPa.toFixed(3) },
    { key: "iso", label: "ISO", score: iso, detail: isoOf(season).toFixed(3) },
    { key: "order", label: "RBI spots", score: heart, detail: `Slot ${ctx.lineupSlot}` },
    { key: "table", label: "Table setters", score: table, detail: ctx.edge?.teamObp != null ? `${ctx.edge.teamObp.toFixed(3)} team OBP` : "—" },
    { key: "park", label: "Park hits", score: park, detail: `${ctx.parkHits}` },
    { key: "platoon", label: "Platoon", score: platoon.score, detail: platoon.detail },
    { key: "ace", label: "Opp starter", score: ace.score, detail: ace.detail },
    { key: "mix", label: "Pitch mix", score: mix.score, detail: mix.detail },
  ];
  const score = Math.round(
    clamp((0.22 * rbiU + 0.12 * iso + 0.16 * heart + 0.12 * table + 0.06 * park + 0.06 * platoon.score + 0.2 * ace.score + 0.06 * mix.score) * 100 * tilt, 8, 95),
  );
  return { score, factors, reasons: pickReasons(factors, [`${season.rbi} RBI`, `batting ${ctx.lineupSlot}`]), mix };
}

export function scoreRuns(season: BatterSeason, ctx: MatchupCtx) {
  const pa = Math.max(season.pa, 1);
  const rate = season.runs / pa;
  const rateU = unit(rate, 0.07, 0.17);
  const obpU = unit(season.obp, 0.29, 0.4);
  const xwoba = saberOr(ctx.saber?.xwoba, 0.3, 0.42);
  const top = ctx.lineupSlot <= 2 ? 0.9 : ctx.lineupSlot <= 4 ? 0.72 : ctx.lineupSlot <= 6 ? 0.48 : 0.28;
  const park = unit((ctx.parkHits + ctx.parkHr) / 2, 90, 118);
  const table = saberOr(ctx.edge?.teamObp, 0.3, 0.345);
  const platoon = platoonFactor(ctx);
  const mix = pitchMixHr(ctx.pitcher?.arsenal, ctx.vsPitches);
  const ace = aceSuppress(ctx.pitcher);
  const tilt = countingForm(season, null, ctx, mix.dmgMult);
  const factors: Factor[] = [
    { key: "runs", label: "R/PA", score: rateU, detail: `${season.runs} R · ${rate.toFixed(3)}/PA` },
    { key: "obp", label: "OBP", score: obpU, detail: season.obp.toFixed(3) },
    { key: "order", label: "Order", score: top, detail: `Slot ${ctx.lineupSlot}` },
    { key: "table", label: "Team OBP", score: table, detail: ctx.edge?.teamObp != null ? ctx.edge.teamObp.toFixed(3) : "—" },
    { key: "xwoba", label: "xwOBA", score: xwoba, detail: ctx.saber?.xwoba != null ? ctx.saber.xwoba.toFixed(3) : "—" },
    { key: "park", label: "Park", score: park, detail: `H ${ctx.parkHits}` },
    { key: "platoon", label: "Platoon", score: platoon.score, detail: platoon.detail },
    { key: "mix", label: "Pitch mix", score: mix.score, detail: mix.detail },
    { key: "ace", label: "Opp starter", score: ace.score, detail: ace.detail },
  ];
  const score = Math.round(
    clamp(
      (0.22 * rateU + 0.14 * obpU + 0.18 * top + 0.1 * table + 0.06 * xwoba + 0.06 * park + 0.06 * platoon.score + 0.08 * mix.score + 0.1 * ace.score) *
        100 *
        tilt,
      8,
      95,
    ),
  );
  return { score, factors, reasons: pickReasons(factors, [`${season.runs} runs`, `batting ${ctx.lineupSlot}`]), mix };
}

export function scoreHrRbi(season: BatterSeason, ctx: MatchupCtx, recentAvg: number | null = null) {
  const pa = Math.max(season.pa, 1);
  const combo = (season.hits + season.runs + season.rbi) / pa;
  const comboU = unit(combo, 0.28, 0.58);
  const xba = saberOr(ctx.saber?.xba, 0.22, 0.33);
  const xwoba = saberOr(ctx.saber?.xwoba, 0.3, 0.42);
  const slot = ctx.lineupSlot <= 5 ? clamp(0.55 + (6 - ctx.lineupSlot) * 0.08, 0.4, 0.92) : 0.36;
  const iso = unit(isoOf(season), 0.11, 0.34);
  const park = unit(ctx.parkHits, 92, 118);
  const platoon = platoonFactor(ctx);
  const table = saberOr(ctx.edge?.teamObp, 0.3, 0.345);
  const ha = haFactor(ctx, "ops");
  const ace = aceSuppress(ctx.pitcher);
  const mix = pitchMixHr(ctx.pitcher?.arsenal, ctx.vsPitches);
  const form = recentAvg == null ? comboU : unit(recentAvg, 0.18, 0.4);
  const tilt = countingForm(season, recentAvg, ctx, mix.dmgMult);
  const factors: Factor[] = [
    { key: "combo", label: "H+R+RBI/PA", score: comboU, detail: combo.toFixed(3) },
    { key: "xba", label: "xBA", score: xba, detail: ctx.saber?.xba != null ? ctx.saber.xba.toFixed(3) : "—" },
    { key: "xwoba", label: "xwOBA", score: xwoba, detail: ctx.saber?.xwoba != null ? ctx.saber.xwoba.toFixed(3) : "—" },
    { key: "order", label: "Order", score: slot, detail: `Slot ${ctx.lineupSlot}` },
    { key: "iso", label: "ISO", score: iso, detail: isoOf(season).toFixed(3) },
    { key: "table", label: "Table", score: table, detail: ctx.edge?.teamObp != null ? ctx.edge.teamObp.toFixed(3) : "—" },
    { key: "park", label: "Park hits", score: park, detail: `${ctx.parkHits}` },
    { key: "platoon", label: "Platoon", score: platoon.score, detail: platoon.detail },
    { key: "home", label: ctx.isHome ? "Home" : "Away", score: ha.score, detail: ha.detail },
    { key: "form", label: "Last 10", score: form, detail: recentAvg == null ? "Season" : recentAvg.toFixed(3) },
    { key: "ace", label: "Opp starter", score: ace.score, detail: ace.detail },
    { key: "mix", label: "Pitch mix", score: mix.score, detail: mix.detail },
  ];
  const score = Math.round(
    clamp(
      (0.18 * comboU +
        0.1 * xba +
        0.08 * xwoba +
        0.14 * slot +
        0.06 * iso +
        0.07 * table +
        0.05 * park +
        0.05 * platoon.score +
        0.02 * ha.score +
        0.1 * form +
        0.08 * ace.score +
        0.07 * mix.score) *
        100 *
        tilt,
      8,
      96,
    ),
  );
  return { score, factors, reasons: pickReasons(factors, [`${season.hits + season.runs + season.rbi} H+R+RBI`]), mix };
}

/** PrizePicks hitter fantasy score ≈ TB + R + RBI + SB + BB. */
export function scoreFantasy(season: BatterSeason, ctx: MatchupCtx, recentAvg: number | null = null) {
  const g = Math.max(season.pa / 4.15, 1);
  const bbG = Math.max(season.obp - season.avg, 0) * (season.pa / g);
  const fsG = season.tb / g + season.runs / g + season.rbi / g + season.sb / g + bbG;
  const fsU = unit(fsG, 3.2, 8.4);
  const combo = scoreHrRbi(season, ctx, recentAvg);
  const mix = combo.mix;
  const ace = aceSuppress(ctx.pitcher);
  const slot = ctx.lineupSlot <= 5 ? clamp(0.55 + (6 - ctx.lineupSlot) * 0.08, 0.4, 0.92) : 0.36;
  const tilt = countingForm(season, recentAvg, ctx, mix.dmgMult);
  const factors: Factor[] = [
    { key: "fs", label: "FS/G", score: fsU, detail: `${fsG.toFixed(1)} TB+R+RBI+SB+BB` },
    ...combo.factors.filter((f) => f.key !== "combo").slice(0, 8),
    { key: "order", label: "Order", score: slot, detail: `Slot ${ctx.lineupSlot}` },
    { key: "ace", label: "Opp starter", score: ace.score, detail: ace.detail },
  ];
  const score = Math.round(clamp((0.34 * fsU + 0.66 * (combo.score / 100)) * 100 * tilt, 8, 96));
  return {
    score,
    factors,
    reasons: pickReasons(factors, [`${fsG.toFixed(1)} fantasy / G`]),
    mix,
    fsG,
  };
}

export function scoreSb(season: BatterSeason, ctx: MatchupCtx) {
  const sbG = season.sb / Math.max(season.pa / 4.1, 1);
  const sbU = unit(sbG, 0.02, 0.35);
  const avgU = unit(season.avg, 0.22, 0.32);
  const top = ctx.lineupSlot <= 2 ? 0.8 : ctx.lineupSlot <= 6 ? 0.45 : 0.25;
  const spd = saberOr(ctx.saber?.spd, 3.5, 8.2);
  const sprint = saberOr(ctx.edge?.sprint, 26.2, 30.2);
  const hp = ctx.edge?.hpTo1b != null ? unit(4.52 - ctx.edge.hpTo1b, 0.08, 0.45) : 0.45;
  const leak = saberOr(ctx.edge?.pitcherSbRate != null ? ctx.edge.pitcherSbRate * 100 : null, 0.35, 2.2);
  const catcher =
    ctx.edge?.catcherCs != null ? unit(0.32 - ctx.edge.catcherCs, 0.04, 0.22) : ctx.edge?.catcherPop != null ? unit(2.05 - ctx.edge.catcherPop, 0.04, 0.18) : 0.5;
  const park = unit(ctx.parkSb, 94, 110);
  const factors: Factor[] = [
    { key: "sb", label: "SB rate", score: sbU, detail: `${season.sb} SB` },
    { key: "sprint", label: "Sprint", score: sprint, detail: ctx.edge?.sprint != null ? `${ctx.edge.sprint.toFixed(1)} ft/s` : "—" },
    { key: "hp", label: "HP to 1B", score: hp, detail: ctx.edge?.hpTo1b != null ? `${ctx.edge.hpTo1b.toFixed(2)}s` : "—" },
    { key: "leak", label: "Pitcher run", score: leak, detail: ctx.edge?.pitcherSbRate != null ? `${(ctx.edge.pitcherSbRate * 100).toFixed(1)}% att` : "—" },
    {
      key: "catcher",
      label: "Catcher",
      score: catcher,
      detail: ctx.edge?.catcherName
        ? `${ctx.edge.catcherName.split(",")[0].trim()} ${ctx.edge.catcherCs != null ? `${(ctx.edge.catcherCs * 100).toFixed(0)}% CS` : ctx.edge.catcherPop != null ? `${ctx.edge.catcherPop.toFixed(2)} pop` : ""}`
        : "—",
    },
    { key: "park", label: "Park SB", score: park, detail: `${ctx.parkSb}` },
    { key: "spd", label: "SPD", score: spd, detail: ctx.saber?.spd != null ? ctx.saber.spd.toFixed(1) : "—" },
    { key: "avg", label: "On base", score: avgU, detail: season.avg.toFixed(3) },
    { key: "order", label: "Order", score: top, detail: `Slot ${ctx.lineupSlot}` },
  ];
  const score = Math.round(
    clamp(
      (0.28 * sbU + 0.16 * sprint + 0.1 * hp + 0.12 * leak + 0.1 * catcher + 0.06 * park + 0.06 * spd + 0.07 * avgU + 0.05 * top) * 100,
      6,
      95,
    ),
  );
  return { score, factors, reasons: pickReasons(factors, [`${season.sb} stolen bases`]) };
}

export function kRateOf(pitcher: PitcherCard): { k9: number; kPct: number; detail: string } {
  const bf = pitcher.bf > 0 ? pitcher.bf : pitcher.ip * 4.25;
  const seasonPct = pitcher.k / Math.max(bf, 1);
  const recPct =
    pitcher.recentBf != null && pitcher.recentBf >= 40 && pitcher.recentK != null
      ? pitcher.recentK / pitcher.recentBf
      : null;
  const k9 = pitcher.recentK9 != null ? 0.58 * pitcher.k9 + 0.42 * pitcher.recentK9 : pitcher.k9;
  const raw = recPct != null ? 0.6 * seasonPct + 0.4 * recPct : seasonPct || k9 / 38.5;
  const kPct = clamp(raw, 0.11, 0.4);
  const detail =
    recPct != null
      ? `${(kPct * 100).toFixed(1)}% K/BF · last ${(recPct * 100).toFixed(1)}%`
      : `${(kPct * 100).toFixed(1)}% K/BF`;
  return { k9, kPct, detail };
}

/** Honest outing length. A 4.9 IP/GS starter is not a 6-inning K factory. */
export function expectedIpOf(pitcher: PitcherCard): number {
  if (isOpener(pitcher)) {
    const r = pitcher.recentIp ?? pitcher.ip / Math.max(pitcher.gamesStarted || pitcher.gamesPlayed || 1, 1);
    return clamp(r || 2.4, 1.6, 3.4);
  }
  const gs = Math.max(pitcher.gamesStarted, 1);
  const seasonIp = pitcher.ip > 0 ? pitcher.ip / gs : 5.1;
  const recent = pitcher.recentIp && pitcher.recentIp > 0 ? pitcher.recentIp : seasonIp;
  let ip = 0.62 * seasonIp + 0.38 * recent;
  if (seasonIp < 5.0) ip = Math.min(ip, 5.12);
  else if (seasonIp < 5.35 && recent < 5.55) ip = Math.min(ip, 5.42);
  if (isShortStart(pitcher)) ip = Math.min(ip, 5.05);
  return clamp(ip, 4.3, 6.25);
}

export function arsenalWhiff(arsenal: PitchTypeRow[] | null | undefined): { score: number; detail: string; mult: number } {
  const rows = (arsenal ?? []).filter((p) => p.whiff != null && p.whiff > 0 && p.usage >= 5);
  if (!rows.length) return { score: 0.5, detail: "—", mult: 1 };
  const w = rows.reduce((s, p) => s + (p.whiff ?? 0) * p.usage, 0);
  const u = rows.reduce((s, p) => s + p.usage, 0) || 1;
  const whiff = w / u;
  return {
    score: unit(whiff, 16, 36),
    detail: `${whiff.toFixed(1)}% mix whiff`,
    mult: clamp(0.9 + (whiff - 24) / 85, 0.9, 1.12),
  };
}

export function expectedKOf(
  pitcher: PitcherCard,
  oppKRate: number,
  parkK = 100,
): { mean: number; ip: number; kPct: number; k9: number } {
  const rates = kRateOf(pitcher);
  const ip = expectedIpOf(pitcher);
  const bfIp = clamp(3.72 + (pitcher.whip || 1.25) * 0.42, 3.9, 4.55);
  const bf = ip * bfIp;
  const park = parkK / 100;
  const opp = clamp(0.86 + oppKRate * 0.62, 0.88, 1.14);
  const mix = arsenalWhiff(pitcher.arsenal);
  const fromPct = rates.kPct * bf;
  const fromK9 = (rates.k9 * ip) / 9;
  let mean = (0.58 * fromPct + 0.42 * fromK9) * park * opp * mix.mult;
  if (isShortStart(pitcher) && !isOpener(pitcher)) mean *= 0.92;
  if (isOpener(pitcher)) mean *= 0.55;
  mean = clamp(mean, 2.2, 8.4);
  return { mean, ip, kPct: rates.kPct, k9: rates.k9 };
}

export function scoreStrikeouts(pitcher: PitcherCard, oppKRate: number, parkK = 100) {
  const exp = expectedKOf(pitcher, oppKRate, parkK);
  if (isOpener(pitcher)) {
    const factors: Factor[] = [
      { key: "open", label: "Opener", score: 0.18, detail: `${pitcher.recentIp != null ? `${pitcher.recentIp.toFixed(1)} IP/app` : `${pitcher.gamesStarted} GS`} — short outing` },
      { key: "k9", label: "K/9", score: unit(pitcher.k9, 7.2, 12.6), detail: pitcher.k9.toFixed(2) },
    ];
    return {
      score: 42,
      factors,
      reasons: ["Opener / short outing — K overs skip"],
      impliedK: exp.mean,
      kRate: exp.kPct,
    };
  }
  const rates = kRateOf(pitcher);
  const k9 = unit(rates.k9, 7.2, 12.6);
  const kPctU = unit(rates.kPct, 0.17, 0.34);
  const recentU = pitcher.recentK9 == null ? k9 : unit(pitcher.recentK9, 6.8, 13.2);
  const whip = unit(1.45 - pitcher.whip, 0.2, 0.85);
  const opp = unit(oppKRate, 0.18, 0.28);
  const workload = unit(pitcher.gamesStarted, 8, 28);
  const xeraU = pitcher.xera == null ? 0.5 : unit(5.2 - pitcher.xera, 0.4, 2.8);
  const primary = primaryOf(pitcher.arsenal);
  const mix = arsenalWhiff(pitcher.arsenal);
  const whiff = primary?.whiff != null ? unit(primary.whiff, 14, 38) : mix.score;
  const park = unit(parkK, 90, 112);
  const vsL = pitcher.vsL?.k9 ?? null;
  const vsR = pitcher.vsR?.k9 ?? null;
  const splitK = vsL != null && vsR != null ? 0.42 * unit(vsL, 6.5, 12.5) + 0.58 * unit(vsR, 6.5, 12.5) : 0.5;
  const ipU = unit(exp.ip, 4.4, 6.2);
  const expU = unit(exp.mean, 3.6, 7.4);
  const factors: Factor[] = [
    { key: "krate", label: "K/BF", score: kPctU, detail: rates.detail },
    { key: "k9", label: "K/9", score: k9, detail: `${rates.k9.toFixed(2)} blended` },
    { key: "expected", label: "Expected Ks", score: expU, detail: `${exp.mean.toFixed(1)} K in ${exp.ip.toFixed(1)} IP` },
    { key: "ip", label: "Outing", score: ipU, detail: `${exp.ip.toFixed(1)} expected IP` },
    { key: "recent", label: "Last 10 K/9", score: recentU, detail: pitcher.recentK9 != null ? pitcher.recentK9.toFixed(2) : "Season" },
    { key: "whiff", label: "Mix whiff", score: mix.score, detail: mix.detail !== "—" ? mix.detail : primary?.whiff != null ? `${primary.code} ${primary.whiff.toFixed(1)}%` : "—" },
    { key: "xera", label: "xERA", score: xeraU, detail: pitcher.xera != null ? pitcher.xera.toFixed(2) : "—" },
    { key: "park", label: "Park K", score: park, detail: `${parkK} K factor` },
    { key: "opp", label: "Opp K rate", score: opp, detail: `${(oppKRate * 100).toFixed(1)}%` },
    { key: "hand", label: "vs L/R", score: splitK, detail: vsL != null && vsR != null ? `${vsL.toFixed(1)} vs L · ${vsR.toFixed(1)} vs R` : "—" },
    { key: "whip", label: "WHIP", score: whip, detail: pitcher.whip.toFixed(2) },
    { key: "work", label: "Workload", score: workload, detail: `${pitcher.gamesStarted} GS` },
  ];
  const score = Math.round(
    clamp(
      (0.18 * kPctU +
        0.14 * k9 +
        0.16 * expU +
        0.08 * ipU +
        0.1 * recentU +
        0.12 * mix.score +
        0.06 * xeraU +
        0.06 * park +
        0.12 * opp +
        0.06 * splitK +
        0.04 * whip +
        0.02 * workload +
        0.04 * whiff) *
        100,
      10,
      96,
    ),
  );
  return {
    score,
    factors,
    reasons: pickReasons(factors, [`${rates.k9.toFixed(1)} K/9`, `${exp.mean.toFixed(1)} expected Ks tonight`]),
    impliedK: exp.mean,
    kRate: rates.kPct,
  };
}

export function platoonEdge(bat: "L" | "R" | "S" | null, throwH: "L" | "R" | "S" | null): number {
  if (!bat || !throwH || throwH === "S") return 0.5;
  if (bat === "S") return 0.58;
  if (bat !== throwH) return 0.68;
  return 0.32;
}

function platoonDetail(value: number): string {
  if (value >= 0.62) return "Favored side";
  if (value <= 0.38) return "Same-side";
  return "Neutral";
}

function pickReasons(factors: Factor[], extras: string[]): string[] {
  const ranked = [...factors]
    .filter(
      (f) =>
        f.detail !== "Season rate" &&
        f.detail !== "No reading" &&
        f.detail !== "Season" &&
        f.detail !== "No arsenal" &&
        f.detail !== "No split" &&
        f.detail !== "—" &&
        f.detail !== "Home" &&
        f.detail !== "Away",
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);
  const lines = ranked.map((f) => `${f.label}: ${f.detail}`);
  return [...lines, ...extras].filter((line, i, arr) => arr.indexOf(line) === i).slice(0, 3);
}

export function usableSplit(split: SplitCard | null | undefined, minPa = 25): split is SplitCard {
  return !!split && split.pa >= minPa;
}
