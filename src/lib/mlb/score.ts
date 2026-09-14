import { mixProfile, primaryOf } from "./pitches";
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
} from "./types";
import { clamp } from "./parse";

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
  return pa >= 10 && hr === 0;
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
    if (hot) return 1.03;
    if (cold) return 0.82;
    return 1;
  }
  if (hot) return 1.07;
  if (cold) return 0.93;
  return 1;
}

export function scoreHomeRun(season: BatterSeason, recentHrPa: number | null, ctx: MatchupCtx, week: WeekForm | null = null) {
  const pa = Math.max(season.pa, 1);
  const hrPa = season.hr / pa;
  const iso = isoOf(season);
  const power = unit(hrPa, 0.018, 0.075);
  const isoU = unit(iso, 0.11, 0.34);
  const flags = ctx.flags ?? recencyFlags(season, week);
  const drought = flags.includes("drought") || hrDrought(week);
  const coldTen = recentHrPa != null && recentHrPa < 0.015;
  const form = drought ? 0.06 : recentHrPa == null ? power : unit(recentHrPa, 0.008, 0.09);
  const formDetail = drought
    ? `0 HR last ${week?.games ?? 6}g / ${week?.pa ?? "?"} PA`
    : recentHrPa == null
      ? "Season rate"
      : `${(recentHrPa * 100).toFixed(1)}% PA last 10`;
  const hr9 = ctx.edge?.pitcherVsHandHr9 ?? ctx.pitcher?.hr9 ?? 1.15;
  const goAo = ctx.pitcher?.goAo ?? 1.0;
  const pitchHr = unit(hr9, 0.55, 1.85);
  const fly = unit(1.4 - goAo, 0.1, 0.9);
  const park = unit(ctx.parkHr, 88, 118);
  const weather = ctx.weather?.carry ?? 0.45;
  const slot = unit(10 - ctx.lineupSlot, 1, 9);
  const saber = ctx.saber;
  const barrel = saberOr(saber?.barrelPa, 1.2, 9.5);
  const xslg = saberOr(saber?.xslg, 0.38, 0.64);
  const xwoba = saberOr(saber?.xwoba, 0.3, 0.42);
  const mix = pitchMixHr(ctx.pitcher?.arsenal, ctx.vsPitches);
  const platoon = platoonFactor(ctx);
  const fb = saberOr(ctx.edge?.fbRate, 18, 38);
  const pull = saberOr(ctx.edge?.pullRate, 32, 52);
  const ha = haFactor(ctx, "slg");
  const dueRaw = saber?.xslg != null ? unit(saber.xslg - season.slg + 0.01, -0.06, 0.08) : 0.5;
  const due = drought ? Math.min(dueRaw, 0.2) : dueRaw;
  const ace = aceSuppress(ctx.pitcher);
  const formBoost = recencyBoost(flags, "hr");
  const loudMix = mix.hrMult >= 1.18;

  const factors: Factor[] = [
    { key: "power", label: "Power", score: power, detail: `${season.hr} HR · ${(hrPa * 100).toFixed(1)}% PA` },
    { key: "form", label: drought ? "Drought" : flags.includes("hot") ? "Hot" : flags.includes("cold") ? "Cold" : "Last 10", score: form, detail: formDetail },
    { key: "barrel", label: "Barrels/PA", score: barrel, detail: saber?.barrelPa != null ? `${saber.barrelPa.toFixed(1)}%` : "—" },
    { key: "xslg", label: "xSLG", score: xslg, detail: saber?.xslg != null ? saber.xslg.toFixed(3) : "—" },
    { key: "mix", label: "Pitch mix", score: mix.score, detail: mix.detail },
    { key: "platoon", label: "Platoon", score: platoon.score, detail: platoon.detail },
    { key: "fly", label: "Fly ball", score: fb, detail: ctx.edge?.fbRate != null ? `${ctx.edge.fbRate.toFixed(0)}% FB` : "—" },
    { key: "iso", label: "ISO", score: isoU, detail: iso.toFixed(3) },
    { key: "pitch", label: "Pitcher HR/9", score: pitchHr, detail: ctx.pitcher ? hr9.toFixed(2) : "League" },
    { key: "park", label: "Park", score: park, detail: `${ctx.parkHr} HR factor` },
    { key: "pull", label: "Pull", score: pull, detail: ctx.edge?.pullRate != null ? `${ctx.edge.pullRate.toFixed(0)}%` : "—" },
    { key: "home", label: ctx.isHome ? "Home" : "Away", score: ha.score, detail: ha.detail },
    { key: "weather", label: "Air", score: weather, detail: ctx.weather?.windLabel ?? "No reading" },
    { key: "xwoba", label: "xwOBA", score: xwoba, detail: saber?.xwoba != null ? saber.xwoba.toFixed(3) : "—" },
    { key: "due", label: "Due", score: due, detail: saber?.xslg != null ? `${(saber.xslg - season.slg >= 0 ? "+" : "")}${(saber.xslg - season.slg).toFixed(3)} xSLG-SLG` : "—" },
    { key: "ace", label: "Opp starter", score: ace.score, detail: ace.detail },
    { key: "order", label: "Order", score: slot, detail: `Slot ${ctx.lineupSlot}` },
  ];

  const raw =
    0.08 * power +
    0.12 * form +
    0.08 * barrel +
    0.06 * xslg +
    0.14 * mix.score +
    0.06 * platoon.score +
    0.04 * fb +
    0.04 * isoU +
    0.07 * pitchHr +
    0.02 * fly +
    0.07 * park +
    0.03 * pull +
    0.03 * ha.score +
    0.02 * weather +
    0.02 * xwoba +
    0.02 * due +
    0.1 * ace.score;

  let score = Math.round(clamp(raw * 100 * (loudMix && flags.includes("cold") ? 1 : formBoost), 8, 97));
  if (drought) score = Math.round(clamp(score * 0.78, 8, 64));
  else if (coldTen && hrPa >= 0.04 && !loudMix) score = Math.round(clamp(score * 0.88, 8, 74));

  let impliedHr = clamp(
    hrPa *
      (4.15 + slot) *
      (0.82 + 0.35 * park) *
      (0.85 + 0.3 * pitchHr) *
      (0.9 + 0.2 * weather) *
      (0.85 + 0.3 * barrel) *
      mix.hrMult *
      (0.92 + 0.16 * platoon.score) *
      (0.94 + 0.12 * fb) *
      (drought ? 0.82 : 0.96 + 0.08 * due) *
      (0.88 + 0.22 * ace.score) *
      (loudMix && flags.includes("cold") ? 1 : formBoost),
    0.04,
    0.72,
  );
  if (recentHrPa != null) {
    const rec = clamp(recentHrPa * (4.15 + slot) * (0.82 + 0.35 * park) * (0.85 + 0.3 * pitchHr) * mix.hrMult, 0.02, 0.55);
    impliedHr = 0.45 * impliedHr + 0.55 * rec;
  }
  if (drought) impliedHr *= 0.5;
  if (flags.includes("cold")) impliedHr *= 0.82;
  if (isAcePitcher(ctx.pitcher?.k9, ctx.pitcher?.xera) && !isOpener(ctx.pitcher) && !ctx.reverse) impliedHr *= 0.7;
  if (isShortStart(ctx.pitcher)) impliedHr *= 1.1;
  impliedHr = clamp(impliedHr * 0.62, 0.03, 0.45);

  const hrPct = 1 - Math.exp(-impliedHr);

  const reasons = pickReasons(factors, [
    drought ? formDetail : `${season.hr} HR in ${season.pa} PA`,
    ctx.pitcher ? `vs ${ctx.pitcher.name.split(" ").slice(-1)[0]} ${hr9.toFixed(2)} HR/9` : "No probable listed",
    `${ctx.parkHr} park HR factor`,
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

export function scoreStrikeouts(pitcher: PitcherCard, oppKRate: number, parkK = 100) {
  if (isOpener(pitcher)) {
    const factors: Factor[] = [
      { key: "open", label: "Opener", score: 0.18, detail: `${pitcher.recentIp != null ? `${pitcher.recentIp.toFixed(1)} IP/app` : `${pitcher.gamesStarted} GS`} — short outing` },
      { key: "k9", label: "K/9", score: unit(pitcher.k9, 7.2, 12.6), detail: pitcher.k9.toFixed(2) },
    ];
    return {
      score: 42,
      factors,
      reasons: ["Opener / short outing — K overs skip"],
    };
  }
  const k9 = unit(pitcher.k9, 7.2, 12.6);
  const recentU = pitcher.recentK9 == null ? k9 : unit(pitcher.recentK9, 6.8, 13.2);
  const whip = unit(1.45 - pitcher.whip, 0.2, 0.85);
  const opp = unit(oppKRate, 0.18, 0.28);
  const workload = unit(pitcher.gamesStarted, 8, 28);
  const xeraU = pitcher.xera == null ? 0.5 : unit(5.2 - pitcher.xera, 0.4, 2.8);
  const primary = primaryOf(pitcher.arsenal);
  const whiff = primary?.whiff != null ? unit(primary.whiff, 14, 38) : 0.5;
  const park = unit(parkK, 90, 112);
  const vsL = pitcher.vsL?.k9 ?? null;
  const vsR = pitcher.vsR?.k9 ?? null;
  const splitK = vsL != null && vsR != null ? 0.42 * unit(vsL, 6.5, 12.5) + 0.58 * unit(vsR, 6.5, 12.5) : 0.5;
  const factors: Factor[] = [
    { key: "k9", label: "K/9", score: k9, detail: pitcher.k9.toFixed(2) },
    { key: "recent", label: "Last 10 K/9", score: recentU, detail: pitcher.recentK9 != null ? pitcher.recentK9.toFixed(2) : "Season" },
    { key: "whiff", label: "Primary whiff", score: whiff, detail: primary?.whiff != null ? `${primary.code} ${primary.whiff.toFixed(1)}%` : "—" },
    { key: "xera", label: "xERA", score: xeraU, detail: pitcher.xera != null ? pitcher.xera.toFixed(2) : "—" },
    { key: "park", label: "Park K", score: park, detail: `${parkK} K factor` },
    { key: "opp", label: "Opp K rate", score: opp, detail: `${(oppKRate * 100).toFixed(1)}%` },
    { key: "hand", label: "vs L/R", score: splitK, detail: vsL != null && vsR != null ? `${vsL.toFixed(1)} vs L · ${vsR.toFixed(1)} vs R` : "—" },
    { key: "whip", label: "WHIP", score: whip, detail: pitcher.whip.toFixed(2) },
    { key: "work", label: "Workload", score: workload, detail: `${pitcher.gamesStarted} GS` },
  ];
  const score = Math.round(
    clamp(
      (0.22 * k9 + 0.16 * recentU + 0.14 * whiff + 0.1 * xeraU + 0.08 * park + 0.14 * opp + 0.08 * splitK + 0.05 * whip + 0.03 * workload) * 100,
      10,
      96,
    ),
  );
  return {
    score,
    factors,
    reasons: pickReasons(factors, [`${pitcher.k9.toFixed(1)} K/9`, `${pitcher.k} K on the year`]),
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
