import type { PitchFamily, PitchMatchup, PitchTypeRow } from "./types.ts";
import { clamp } from "./parse.ts";

export const PITCH_META: Record<string, { name: string; family: PitchFamily }> = {
  FF: { name: "4-Seam", family: "heat" },
  FA: { name: "Fastball", family: "heat" },
  SI: { name: "Sinker", family: "heat" },
  FC: { name: "Cutter", family: "heat" },
  SL: { name: "Slider", family: "break" },
  ST: { name: "Sweeper", family: "break" },
  SV: { name: "Slurve", family: "break" },
  CU: { name: "Curve", family: "break" },
  KC: { name: "Knuckle Curve", family: "break" },
  CS: { name: "Slow Curve", family: "break" },
  CH: { name: "Changeup", family: "off" },
  FS: { name: "Splitter", family: "off" },
  FO: { name: "Forkball", family: "off" },
  KN: { name: "Knuckle", family: "off" },
  SC: { name: "Screwball", family: "off" },
  EP: { name: "Eephus", family: "off" },
};

export const MIX_CODES = ["ff", "si", "fc", "sl", "ch", "cu", "fs", "kn", "st", "sv"] as const;

export function pitchCode(raw: string | null | undefined): string {
  return (raw ?? "").trim().toUpperCase();
}

export function pitchMeta(code: string): { name: string; family: PitchFamily } {
  return PITCH_META[code] ?? { name: code || "Pitch", family: "heat" };
}

export function familyFill(family: PitchFamily): string {
  if (family === "break") return "bg-brick";
  if (family === "off") return "bg-pine";
  return "bg-accent";
}

export function blankPitch(code: string, name?: string): PitchTypeRow {
  const meta = pitchMeta(code);
  return {
    code,
    name: name || meta.name,
    family: meta.family,
    usage: 0,
    velo: null,
    pitches: null,
    pa: null,
    slg: null,
    xslg: null,
    xba: null,
    xwoba: null,
    whiff: null,
    kPct: null,
    hardHit: null,
    rv100: null,
  };
}

export function primaryOf(rows: PitchTypeRow[] | null | undefined): PitchTypeRow | null {
  if (!rows?.length) return null;
  return [...rows].sort((a, b) => b.usage - a.usage)[0] ?? null;
}

export function familyMix(rows: PitchTypeRow[] | null | undefined): { heat: number; break: number; off: number } {
  const out = { heat: 0, break: 0, off: 0 };
  for (const row of rows ?? []) out[row.family] += row.usage;
  return out;
}

export function dominantFamily(rows: PitchTypeRow[] | null | undefined): PitchFamily {
  const mix = familyMix(rows);
  if (mix.break >= mix.heat && mix.break >= mix.off) return "break";
  if (mix.off >= mix.heat && mix.off >= mix.break) return "off";
  return "heat";
}

export function matchupOf(arsenal: PitchTypeRow[] | null | undefined, vs: PitchTypeRow[] | null | undefined): PitchMatchup | null {
  const primary = primaryOf(arsenal);
  if (!primary) return null;
  const seen = vs?.find((row) => row.code === primary.code) ?? null;
  return {
    code: primary.code,
    name: primary.name,
    family: primary.family,
    usage: primary.usage,
    batterXslg: seen?.xslg ?? null,
    batterWhiff: seen?.whiff ?? null,
    pitcherXwoba: primary.xwoba ?? null,
    pitcherWhiff: primary.whiff ?? null,
    pitcherSlg: primary.slg ?? null,
  };
}

export type MixProfile = {
  score: number;
  barrel: number;
  xwoba: number;
  xslg: number;
  hardHit: number;
  dmgMult: number;
  hrMult: number;
  kMult: number;
  detail: string;
  mixLabel: string;
  coverage: number;
  matchup: PitchMatchup | null;
};

/**
 * Usage-weighted mash vs the starter's whole mix — not the primary pitch alone.
 * Barrel is a hard-hit proxy (~0.21 × HH% ≈ barrel%). Multipliers shrink toward 1
 * when the hitter's pitch-type sample is thin.
 */
export function mixProfile(
  arsenal: PitchTypeRow[] | null | undefined,
  vs: PitchTypeRow[] | null | undefined,
): MixProfile {
  const matchup = matchupOf(arsenal, vs);
  const fam = familyMix(arsenal);
  const mixLabel = arsenal?.length
    ? `FB ${Math.round(fam.heat)}/BRK ${Math.round(fam.break)}/OFF ${Math.round(fam.off)}`
    : "—";
  const empty: MixProfile = {
    score: 0.45,
    barrel: 6.5,
    xwoba: 0.32,
    xslg: 0.41,
    hardHit: 38,
    dmgMult: 1,
    hrMult: 1,
    kMult: 1,
    detail: "No arsenal",
    mixLabel,
    coverage: 0,
    matchup,
  };
  const pitches = (arsenal ?? []).filter((p) => p.usage >= 4);
  if (!pitches.length) return empty;

  let wXslg = 0;
  let wXslgU = 0;
  let wXwoba = 0;
  let wXwobaU = 0;
  let wHard = 0;
  let wHardU = 0;
  let wK = 0;
  let wKU = 0;
  let coverage = 0;

  for (const p of pitches) {
    const bat = vs?.find((row) => row.code === p.code);
    const u = p.usage;
    const xslg = bat?.xslg ?? p.xslg;
    const xwoba = bat?.xwoba ?? p.xwoba;
    const hard = bat?.hardHit ?? p.hardHit;
    const kPct = bat?.kPct ?? p.kPct;
    if (xslg != null) {
      wXslg += xslg * u;
      wXslgU += u;
      if (bat?.xslg != null) coverage += u;
    }
    if (xwoba != null) {
      wXwoba += xwoba * u;
      wXwobaU += u;
      if (bat?.xwoba != null) coverage += u * 0.35;
    }
    if (hard != null) {
      wHard += hard * u;
      wHardU += u;
    }
    if (kPct != null) {
      wK += kPct * u;
      wKU += u;
    }
  }

  const mixXslg = wXslgU ? wXslg / wXslgU : 0.41;
  const mixXwoba = wXwobaU ? wXwoba / wXwobaU : 0.32;
  const mixHard = wHardU ? wHard / wHardU : 38;
  const mixK = wKU ? wK / wKU : 22;
  const mixBarrel = mixHard * 0.21;

  const trust = clamp(coverage / 55, 0.28, 1);
  const rawDmg = clamp(mixXwoba / 0.33, 0.72, 1.36);
  const rawHr = clamp(mixBarrel / 8, 0.58, 1.52);
  const rawK = clamp(mixK / 22.5, 0.8, 1.28);
  const dmgMult = 1 + (rawDmg - 1) * trust;
  const hrMult = 1 + (rawHr - 1) * trust;
  const kMult = 1 + (rawK - 1) * trust;

  const mash = clamp((mixXslg - 0.38) / 0.26, 0, 1);
  const con = clamp((mixXwoba - 0.28) / 0.16, 0, 1);
  const brl = clamp((mixBarrel - 4) / 10, 0, 1);
  const score = clamp(0.42 * mash + 0.38 * con + 0.2 * brl, 0.05, 0.98);

  return {
    score,
    barrel: mixBarrel,
    xwoba: mixXwoba,
    xslg: mixXslg,
    hardHit: mixHard,
    dmgMult,
    hrMult,
    kMult,
    detail: `${mixLabel} · ${mixBarrel.toFixed(1)} mix brl · ${mixXwoba.toFixed(3)} xwOBA`,
    mixLabel,
    coverage,
    matchup,
  };
}
