import { blankPitch, MIX_CODES, pitchCode, pitchMeta } from "./pitches";
import { num, parseCsv } from "./parse";
import type { PitchTypeRow, SaberCard } from "./types";

const UA = "BlastRadius/1.3 (home-run desk)";

async function csv(url: string): Promise<Record<string, string>[]> {
  const res = await fetch(url, {
    headers: { Accept: "text/csv", "User-Agent": UA },
    signal: AbortSignal.timeout(16000),
  });
  if (!res.ok) throw new Error(`Savant ${res.status}`);
  return parseCsv(await res.text());
}

function idOf(row: Record<string, string>): number {
  return Math.round(num(row.player_id || row.playerId || row.pitcher));
}

function n(row: Record<string, string>, key: string): number | null {
  if (!(key in row) || row[key] === "" || row[key] == null) return null;
  const v = num(row[key]);
  return Number.isFinite(v) ? v : null;
}

function ensureList(map: Map<number, PitchTypeRow[]>, id: number): PitchTypeRow[] {
  const hit = map.get(id);
  if (hit) return hit;
  const next: PitchTypeRow[] = [];
  map.set(id, next);
  return next;
}

function upsertPitch(list: PitchTypeRow[], code: string, name?: string): PitchTypeRow {
  const existing = list.find((row) => row.code === code);
  if (existing) {
    if (name && existing.name === existing.code) existing.name = name;
    return existing;
  }
  const row = blankPitch(code, name);
  list.push(row);
  return row;
}

function applyStats(row: PitchTypeRow, src: Record<string, string>) {
  const usage = n(src, "pitch_usage");
  if (usage != null) row.usage = usage;
  const pitches = n(src, "pitches");
  if (pitches != null) row.pitches = pitches;
  const pa = n(src, "pa");
  if (pa != null) row.pa = pa;
  const slg = n(src, "slg");
  if (slg != null) row.slg = slg;
  const xslg = n(src, "est_slg");
  if (xslg != null) row.xslg = xslg;
  const xba = n(src, "est_ba");
  if (xba != null) row.xba = xba;
  const xwoba = n(src, "est_woba");
  if (xwoba != null) row.xwoba = xwoba;
  const whiff = n(src, "whiff_percent");
  if (whiff != null) row.whiff = whiff;
  const kPct = n(src, "k_percent");
  if (kPct != null) row.kPct = kPct;
  const hardHit = n(src, "hard_hit_percent");
  if (hardHit != null) row.hardHit = hardHit;
  const rv = n(src, "run_value_per_100");
  if (rv != null) row.rv100 = rv;
  const named = src.pitch_name?.trim();
  if (named) row.name = named;
}

export async function loadSaberMaps(season: number): Promise<{
  batters: Map<number, SaberCard>;
  pitchers: Map<number, number>;
}> {
  const batters = new Map<number, SaberCard>();
  const pitchers = new Map<number, number>();

  const [expected, statcast, saber, px] = await Promise.allSettled([
    csv(
      `https://baseballsavant.mlb.com/leaderboard/expected_statistics?type=batter&year=${season}&min=50&csv=true`,
    ),
    csv(`https://baseballsavant.mlb.com/leaderboard/statcast?type=batter&year=${season}&min=50&csv=true`),
    fetch(
      `https://statsapi.mlb.com/api/v1/stats?stats=sabermetrics&group=hitting&season=${season}&sportId=1&limit=800&playerPool=all`,
      { headers: { Accept: "application/json", "User-Agent": UA }, signal: AbortSignal.timeout(14000) },
    ).then(async (res) => {
      if (!res.ok) throw new Error(String(res.status));
      return res.json() as Promise<{
        stats?: Array<{ splits?: Array<{ player?: { id: number }; stat?: Record<string, unknown> }> }>;
      }>;
    }),
    csv(
      `https://baseballsavant.mlb.com/leaderboard/expected_statistics?type=pitcher&year=${season}&min=q&csv=true`,
    ),
  ]);

  const ensure = (id: number): SaberCard => {
    const hit = batters.get(id);
    if (hit) return hit;
    const blank: SaberCard = {
      xba: null,
      xslg: null,
      xwoba: null,
      woba: null,
      wrcPlus: null,
      war: null,
      spd: null,
      barrels: null,
      barrelPct: null,
      barrelPa: null,
      evAvg: null,
      evMax: null,
      launch: null,
      hardHit: null,
      sweetSpot: null,
    };
    batters.set(id, blank);
    return blank;
  };

  if (expected.status === "fulfilled") {
    for (const row of expected.value) {
      const id = idOf(row);
      if (!id) continue;
      const card = ensure(id);
      card.xba = n(row, "est_ba");
      card.xslg = n(row, "est_slg");
      card.xwoba = n(row, "est_woba");
      card.woba = card.woba ?? n(row, "woba");
    }
  }

  if (statcast.status === "fulfilled") {
    for (const row of statcast.value) {
      const id = idOf(row);
      if (!id) continue;
      const card = ensure(id);
      card.launch = n(row, "avg_hit_angle");
      card.sweetSpot = n(row, "anglesweetspotpercent");
      card.evMax = n(row, "max_hit_speed");
      card.evAvg = n(row, "avg_hit_speed");
      card.hardHit = n(row, "ev95percent");
      card.barrels = n(row, "barrels");
      card.barrelPct = n(row, "brl_percent");
      card.barrelPa = n(row, "brl_pa");
    }
  }

  if (saber.status === "fulfilled") {
    for (const split of saber.value.stats?.[0]?.splits ?? []) {
      const id = split.player?.id;
      if (!id) continue;
      const card = ensure(id);
      const stat = split.stat ?? {};
      card.woba = typeof stat.woba === "number" ? stat.woba : card.woba;
      card.wrcPlus = typeof stat.wRcPlus === "number" ? Math.round(stat.wRcPlus) : card.wrcPlus;
      card.war = typeof stat.war === "number" ? stat.war : card.war;
      card.spd = typeof stat.spd === "number" ? stat.spd : card.spd;
    }
  }

  if (px.status === "fulfilled") {
    for (const row of px.value) {
      const id = idOf(row);
      const xera = n(row, "xera");
      if (id && xera != null) pitchers.set(id, xera);
    }
  }

  return { batters, pitchers };
}

export async function loadPitchMaps(season: number): Promise<{
  pitcherPitches: Map<number, PitchTypeRow[]>;
  batterPitches: Map<number, PitchTypeRow[]>;
}> {
  const pitcherPitches = new Map<number, PitchTypeRow[]>();
  const batterPitches = new Map<number, PitchTypeRow[]>();

  const [mix, speed, pStats, bStats] = await Promise.allSettled([
    csv(`https://baseballsavant.mlb.com/leaderboard/pitch-arsenals?year=${season}&min=50&type=n_&hand=&csv=true`),
    csv(
      `https://baseballsavant.mlb.com/leaderboard/pitch-arsenals?year=${season}&min=50&type=avg_speed&hand=&csv=true`,
    ),
    csv(
      `https://baseballsavant.mlb.com/leaderboard/pitch-arsenal-stats?type=pitcher&pitchType=&year=${season}&team=&min=25&csv=true`,
    ),
    csv(
      `https://baseballsavant.mlb.com/leaderboard/pitch-arsenal-stats?type=batter&pitchType=&year=${season}&team=&min=25&csv=true`,
    ),
  ]);

  if (mix.status === "fulfilled") {
    for (const row of mix.value) {
      const id = idOf(row);
      if (!id) continue;
      const list = ensureList(pitcherPitches, id);
      for (const code of MIX_CODES) {
        const usage = n(row, `n_${code}`);
        if (usage == null || usage <= 0) continue;
        const pitch = upsertPitch(list, pitchCode(code));
        pitch.usage = usage;
      }
    }
  }

  if (speed.status === "fulfilled") {
    for (const row of speed.value) {
      const id = idOf(row);
      if (!id) continue;
      const list = ensureList(pitcherPitches, id);
      for (const code of MIX_CODES) {
        const velo = n(row, `${code}_avg_speed`);
        if (velo == null) continue;
        const pitch = upsertPitch(list, pitchCode(code));
        pitch.velo = velo;
      }
    }
  }

  if (pStats.status === "fulfilled") {
    for (const row of pStats.value) {
      const id = idOf(row);
      const code = pitchCode(row.pitch_type);
      if (!id || !code) continue;
      const list = ensureList(pitcherPitches, id);
      const pitch = upsertPitch(list, code, row.pitch_name);
      applyStats(pitch, row);
    }
  }

  if (bStats.status === "fulfilled") {
    for (const row of bStats.value) {
      const id = idOf(row);
      const code = pitchCode(row.pitch_type);
      if (!id || !code) continue;
      const list = ensureList(batterPitches, id);
      const pitch = upsertPitch(list, code, row.pitch_name);
      applyStats(pitch, row);
    }
  }

  const tidy = (map: Map<number, PitchTypeRow[]>) => {
    for (const [id, list] of map) {
      const cleaned = list
        .filter((row) => row.usage > 0 || (row.pa ?? 0) > 0)
        .map((row) => {
          const meta = pitchMeta(row.code);
          if (!row.name) row.name = meta.name;
          row.family = meta.family;
          return row;
        })
        .sort((a, b) => b.usage - a.usage);
      map.set(id, cleaned);
    }
  };

  tidy(pitcherPitches);
  tidy(batterPitches);

  return { pitcherPitches, batterPitches };
}
