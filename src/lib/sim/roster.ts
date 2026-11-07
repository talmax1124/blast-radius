import type { NbaGameIn, NbaPlayerIn } from "./nba.ts";
import type { NflGameIn, NflPlayerIn } from "./nfl.ts";

/**
 * Check a simulated roster against the real one before any sims run.
 *
 * A million replays of the wrong roster are still wrong. On Nov 2 the Seattle board carried Emanuel Wilson
 * (RB3 on ESPN's depth chart) as the only back while Zach Charbonnet and Jadarian Price, RB1 and RB2,
 * were active and took every carry. Suns–Warriors broke the same way when Stephen Curry returned.
 *
 * NFL: drop players ruled out, rebuild a position group from the depth chart when it changed, and
 * give the group's volume to the players who are really there. NBA: drop players ruled out, hand their
 * minutes and stats to teammates, and flag active rotation players the sim does not have.
 */

export type Status = "active" | "questionable" | "doubtful" | "out";

export type DepthRow = { team: string; pos: "QB" | "RB" | "WR" | "TE"; rank: number; name: string; status: Status };
export type InjuryRow = { team: string; name: string; status: Status };

export type RosterChange = {
  team: string;
  name: string;
  kind: "removed" | "added" | "reshared" | "trimmed" | "missing";
  note: string;
};

/** Expected share of a position group's volume by depth rank, before the model's own split. */
const RANK_SHARE: Record<DepthRow["pos"], number[]> = {
  QB: [1],
  RB: [0.55, 0.32, 0.13],
  WR: [0.36, 0.3, 0.2, 0.09, 0.05],
  TE: [0.72, 0.22, 0.06],
};

/** Depth slots that count as starters: a missing one rebuilds the group, a missing backup does not. */
const STARTERS: Record<DepthRow["pos"], number> = { QB: 1, RB: 2, WR: 3, TE: 1 };

/** Questionable players play most of the time; their volume is trimmed, not removed. */
const QUESTIONABLE_KEEP = 0.85;

const VOLUME: Record<DepthRow["pos"], (keyof NflPlayerIn)[]> = {
  QB: ["passAtt", "passYd", "passTd", "rushAtt", "rushYd", "rushTd"],
  RB: ["rushAtt", "rushYd", "rushTd", "targets", "rec", "recYd", "recTd"],
  WR: ["targets", "rec", "recYd", "recTd", "rushAtt", "rushYd", "rushTd"],
  TE: ["targets", "rec", "recYd", "recTd"],
};

export function normName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, "")
    .replace(/[^a-z]/g, "");
}

export function parseStatus(raw: string | undefined): Status {
  const s = (raw ?? "").toLowerCase();
  if (s.includes("out") || s.includes("reserve") || s.includes("suspend") || s === "ir") return "out";
  if (s.includes("doubt")) return "doubtful";
  if (s.includes("question") || s.includes("day-to-day") || s.includes("game-time")) return "questionable";
  return "active";
}

function posGroup(pos: string): DepthRow["pos"] | null {
  const p = pos.toUpperCase();
  if (p === "QB" || p === "RB" || p === "WR" || p === "TE") return p;
  if (p === "FB" || p === "HB") return "RB";
  return null;
}

function statusMap(injuries: InjuryRow[], depth: DepthRow[]): Map<string, Status> {
  const out = new Map<string, Status>();
  for (const d of depth) out.set(`${d.team}|${normName(d.name)}`, d.status);
  // The injury report is the more current source when both speak.
  for (const i of injuries) out.set(`${i.team}|${normName(i.name)}`, i.status);
  return out;
}

const playsOut = (s: Status | undefined) => s === "out" || s === "doubtful";

export function checkNflRoster(game: NflGameIn, depth: DepthRow[], injuries: InjuryRow[] = []): { game: NflGameIn; changes: RosterChange[] } {
  const status = statusMap(injuries, depth);
  const changes: RosterChange[] = [];
  const keep: NflPlayerIn[] = [];
  const groups = new Map<string, NflPlayerIn[]>();

  for (const p of game.players) {
    const group = posGroup(p.pos);
    if (!group) {
      keep.push(p);
      continue;
    }
    const key = `${p.team}|${group}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }

  for (const team of [game.home, game.away]) {
    for (const group of Object.keys(RANK_SHARE) as DepthRow["pos"][]) {
      const key = `${team}|${group}`;
      const simmed = groups.get(key) ?? [];
      const chart = depth
        .filter((d) => d.team === team && d.pos === group)
        .sort((a, b) => a.rank - b.rank);
      if (!chart.length) {
        keep.push(...simmed);
        continue;
      }
      const stats = VOLUME[group];
      const total = Object.fromEntries(stats.map((s) => [s, simmed.reduce((sum, p) => sum + (Number(p[s]) || 0), 0)])) as Record<string, number>;
      const lead = stats[0];

      const removed = simmed.filter((p) => playsOut(status.get(`${team}|${normName(p.name)}`)));
      for (const p of removed) changes.push({ team, name: p.name, kind: "removed", note: `ruled ${status.get(`${team}|${normName(p.name)}`)}` });
      const present = simmed.filter((p) => !removed.includes(p));

      const slots = RANK_SHARE[group].length;
      const healthy = chart.filter((d) => !playsOut(d.status) && !playsOut(status.get(`${team}|${normName(d.name)}`)));
      const simmedNames = new Set(present.map((p) => normName(p.name)));
      const added = healthy.slice(0, STARTERS[group]).filter((d) => !simmedNames.has(normName(d.name)));

      if (!removed.length && !added.length) {
        keep.push(...present);
        continue;
      }
      if (total[lead] <= 0) {
        // Nothing to hand out (the sim never had this group's volume); flag and move on.
        for (const d of added) changes.push({ team, name: d.name, kind: "missing", note: `${group}${d.rank} on the depth chart, no projection to give` });
        keep.push(...present);
        continue;
      }

      // Only removals: the model's split still holds among the players left, so scale them up.
      // A missing starter: the model's split assumed he was gone, so the group follows depth order.
      const rankOf = new Map(healthy.map((d, i) => [normName(d.name), i]));
      const people: { p: NflPlayerIn; w: number; isNew: boolean }[] = [];
      if (!added.length) {
        for (const p of present) people.push({ p, w: Number(p[lead]) || 0, isNew: false });
      } else {
        const prior = (name: string) => {
          const r = rankOf.get(normName(name));
          return r != null && r < slots ? RANK_SHARE[group][r] : 0.03;
        };
        // Added starters take their depth share of the group; the players the sim already had split the
        // rest the way the model had them, except a player the chart ranks behind an added starter,
        // whose model share assumed the starter was gone.
        const all = [...present.map((p) => p.name), ...added.map((d) => d.name)];
        const priorSum = all.reduce((s, n) => s + prior(n), 0) || 1;
        const addedShare = added.reduce((s, d) => s + prior(d.name), 0) / priorSum;
        const stale = (name: string) => (rankOf.get(normName(name)) ?? slots) > Math.min(...added.map((d) => rankOf.get(normName(d.name)) ?? 0)) && group === "RB";
        const own = present.map((p) => (stale(p.name) ? 0 : Number(p[lead]) || 0));
        const ownSum = own.reduce((a, b) => a + b, 0);
        const staleShare = present.reduce((s, p) => s + (stale(p.name) ? prior(p.name) / priorSum : 0), 0);
        const rest = Math.max(0, 1 - addedShare - staleShare);
        present.forEach((p, i) => {
          const w = stale(p.name) ? prior(p.name) / priorSum : ownSum > 0 ? rest * (own[i] / ownSum) : prior(p.name) / priorSum;
          people.push({ p, w, isNew: false });
        });
        for (const d of added) people.push({ p: { name: d.name, team, pos: group }, w: prior(d.name) / priorSum, isNew: true });
      }
      for (const x of people) {
        const s = status.get(`${team}|${normName(x.p.name)}`);
        if (s === "questionable") x.w *= QUESTIONABLE_KEEP;
      }
      const wSum = people.reduce((s, x) => s + x.w, 0) || 1;
      for (const x of people) {
        const share = x.w / wSum;
        const next: NflPlayerIn = { ...x.p };
        for (const s of stats) (next as Record<string, unknown>)[s] = total[s] * share;
        keep.push(next);
        const before = x.isNew ? 0 : (Number(x.p[lead]) || 0);
        changes.push({
          team,
          name: x.p.name,
          kind: x.isNew ? "added" : "reshared",
          note: `${group} ${String(lead)} ${before.toFixed(1)} → ${(total[lead] * share).toFixed(1)}`,
        });
      }
    }
  }

  // Players on teams outside this game, or in groups the loops never saw.
  const seen = new Set(keep.map((p) => `${p.team}|${p.name}`));
  for (const list of groups.values()) for (const p of list) if (![game.home, game.away].includes(p.team) && !seen.has(`${p.team}|${p.name}`)) keep.push(p);
  return { game: { ...game, players: keep }, changes };
}

/** Minutes an active NBA rotation player has to be projected for before a missing one blocks the card. */
export function checkNbaRoster(
  game: NbaGameIn,
  injuries: InjuryRow[],
  rotation: { team: string; name: string; minutes: number }[] = [],
): { game: NbaGameIn; changes: RosterChange[] } {
  const status = statusMap(injuries, []);
  const changes: RosterChange[] = [];
  const players: NbaPlayerIn[] = [];
  for (const team of [game.home, game.away]) {
    const roster = game.players.filter((p) => p.team === team);
    const out = roster.filter((p) => playsOut(status.get(`${team}|${normName(p.name)}`)));
    const left = roster.filter((p) => !out.includes(p));
    const freed = out.reduce((s, p) => s + p.minutes, 0);
    for (const p of out) changes.push({ team, name: p.name, kind: "removed", note: `ruled ${status.get(`${team}|${normName(p.name)}`)}, ${p.minutes.toFixed(0)} min handed out` });
    const qTrim = left.map((p) => (status.get(`${team}|${normName(p.name)}`) === "questionable" ? QUESTIONABLE_KEEP : 1));
    const trimmed = left.reduce((s, p, i) => s + p.minutes * (1 - qTrim[i]), 0);
    const pool = freed + trimmed;
    const base = left.reduce((s, p, i) => s + p.minutes * qTrim[i], 0) || 1;
    left.forEach((p, i) => {
      const keepMin = p.minutes * qTrim[i];
      // Freed minutes go out in proportion to minutes, capped near a starter's load.
      const extra = Math.min(pool * (keepMin / base), Math.max(0, 40 - keepMin));
      const minutes = keepMin + extra;
      const k = p.minutes > 0 ? minutes / p.minutes : 1;
      if (qTrim[i] < 1) changes.push({ team, name: p.name, kind: "trimmed", note: `questionable, minutes ${p.minutes.toFixed(0)} → ${minutes.toFixed(0)}` });
      players.push({ ...p, minutes, pts: p.pts * k, reb: p.reb * k, ast: p.ast * k, threes: p.threes * k });
    });
    const have = new Set(roster.map((p) => normName(p.name)));
    for (const r of rotation.filter((r) => r.team === team && r.minutes >= 15)) {
      if (have.has(normName(r.name)) || playsOut(status.get(`${team}|${normName(r.name)}`))) continue;
      changes.push({ team, name: r.name, kind: "missing", note: `active and ~${r.minutes.toFixed(0)} min a night, not in the sim` });
    }
  }
  players.push(...game.players.filter((p) => p.team !== game.home && p.team !== game.away));
  return { game: { ...game, players }, changes };
}

/** Changes a person should look at before the card goes out: a starter the sim had no projection for, or one it had to add. */
export function needsReview(changes: RosterChange[]): RosterChange[] {
  return changes.filter((c) => c.kind === "missing" || c.kind === "added");
}

/**
 * Who is under center, judged by how much of the team's passing he has done this season.
 * A regular starter has thrown most of the passes; a backup has some; an emergency starter (a third-string
 * or practice-squad call-up) has almost none. On Nov 5 Joe Fagnano, with 9% of Baltimore's attempts,
 * threw for 60 yards against projections of 160-190, and every Ravens receiving over missed.
 */
export type QbLevel = "starter" | "backup" | "emergency";

export function qbLevel(share: number): QbLevel {
  if (share >= 0.4) return "starter";
  if (share >= 0.1) return "backup";
  return "emergency";
}

/** What a downgrade at quarterback does to the team's passing game: yards, touchdowns and catches. */
export const QB_DOWNGRADE: Record<Exclude<QbLevel, "starter">, { yards: number; tds: number; catches: number }> = {
  backup: { yards: 0.85, tds: 0.8, catches: 0.95 },
  emergency: { yards: 0.68, tds: 0.6, catches: 0.88 },
};

export function applyQbDowngrade(game: NflGameIn, team: string, level: QbLevel): { game: NflGameIn; change: RosterChange | null } {
  if (level === "starter") return { game, change: null };
  const k = QB_DOWNGRADE[level];
  const players = game.players.map((p): NflPlayerIn => {
    if (p.team !== team) return p;
    return {
      ...p,
      passYd: p.passYd != null ? p.passYd * k.yards : undefined,
      passTd: p.passTd != null ? p.passTd * k.tds : undefined,
      rec: p.rec != null ? p.rec * k.catches : undefined,
      recYd: p.recYd != null ? p.recYd * k.yards : undefined,
      recTd: p.recTd != null ? p.recTd * k.tds : undefined,
    };
  });
  return {
    game: { ...game, players },
    change: { team, name: "passing game", kind: "trimmed", note: `${level} quarterback: passing and receiving yards x${k.yards}, touchdowns x${k.tds}` },
  };
}
