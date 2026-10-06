/**
 * Monday simulation, Eagles at Bears, September 28, 2026.
 * Spread PHI -3.5, total 41.5. Weeks 1–2 only.
 * Barkley's week-2 stinger is not his role. Caleb Williams is out.
 * Case Keenum replaces him. Goedert's targets are split onto the receivers.
 * Each target is simulated, then each catch draws its own yards,
 * so a one-catch game can miss a short yard line.
 * A shared team factor ties legs on the same offense together.
 */

export type Side = "PHI" | "CHI";

export type MondayLeg = {
  id: string;
  player: string;
  team: Side;
  pos: string;
  label: string;
  line: number;
  mean: number;
  p: number;
  why: string;
};

export type MondayReport = {
  detail: string;
  spread: string;
  total: number;
  sims: number;
  blowout: number;
  oneScore: number;
  legs: MondayLeg[];
  sweep: number;
  sweepIfBlowout: number;
  sweepIfClose: number;
  traps: string[];
  script: string;
};

type Proc = {
  id: string;
  player: string;
  team: Side;
  pos: string;
  label: string;
  line: number;
  why: string;
  side: Side;
  kind: "rec" | "recyd" | "pass" | "rush";
  /** Share of team dropbacks, or rush attempts, or pass attempts. */
  volume: number;
  catchP: number;
  rate: number;
  rateCv: number;
};

const CANDIDATES: Proc[] = [
  {
    id: "wicks-yd",
    player: "Dontayvion Wicks",
    team: "PHI",
    pos: "WR",
    label: "Rec yds",
    line: 42.5,
    why: "73 and 74 yards across the two weeks. Part of Goedert’s targets move here. The shrunk yards-per-catch still clears 42.5.",
    side: "PHI",
    kind: "recyd",
    volume: 0.21,
    catchP: 0.68,
    rate: 13.4,
    rateCv: 0.62,
  },
  {
    id: "smith-rec",
    player: "DeVonta Smith",
    team: "PHI",
    pos: "WR",
    label: "Receptions",
    line: 5.5,
    why: "About 40% of Eagles targets after Goedert is removed. Week 2 was 10 catches. Need 6. His 72.5 yard line is the wide one.",
    side: "PHI",
    kind: "rec",
    volume: 0.4,
    catchP: 0.68,
    rate: 12.1,
    rateCv: 0.55,
  },
  {
    id: "smith-yd",
    player: "DeVonta Smith",
    team: "PHI",
    pos: "WR",
    label: "Rec yds",
    line: 72.5,
    why: "The catch total is the tighter market. Yards clear more often than not, and miss more often than the receptions.",
    side: "PHI",
    kind: "recyd",
    volume: 0.4,
    catchP: 0.68,
    rate: 12.1,
    rateCv: 0.55,
  },
  {
    id: "hurts-pass",
    player: "Jalen Hurts",
    team: "PHI",
    pos: "QB",
    label: "Pass yds",
    line: 219.5,
    why: "203 then 264. About 32 attempts at a shrunk 7.3 yards per attempt. Same script as Smith and Wicks.",
    side: "PHI",
    kind: "pass",
    volume: 32,
    catchP: 1,
    rate: 7.25,
    rateCv: 0.18,
  },
  {
    id: "swift-yd",
    player: "D'Andre Swift",
    team: "CHI",
    pos: "RB",
    label: "Rec yds",
    line: 13.5,
    why: "Week 2 with a backup was 5 for 54, in a game Chicago only scored 3. Keenum should live underneath. A one-catch night still misses 13.5.",
    side: "CHI",
    kind: "recyd",
    volume: 0.17,
    catchP: 0.7,
    rate: 11.2,
    rateCv: 0.58,
  },
  {
    id: "raymond-rec",
    player: "Kalif Raymond",
    team: "CHI",
    pos: "WR",
    label: "Receptions",
    line: 2.5,
    why: "Target leader, 8 then 5. Need 3 catches. The 24.5 yard line was close and lost the tie: a dump-off can miss the yards and still count here.",
    side: "CHI",
    kind: "rec",
    volume: 0.19,
    catchP: 0.74,
    rate: 10.3,
    rateCv: 0.55,
  },
  {
    id: "monangai-rush",
    player: "Kyle Monangai",
    team: "CHI",
    pos: "RB",
    label: "Rush yds",
    line: 39.5,
    why: "Ten carries each week. Helps if Chicago only runs, which is the script that hurts Raymond and Swift.",
    side: "CHI",
    kind: "rush",
    volume: 10.5,
    catchP: 1,
    rate: 4.7,
    rateCv: 0.42,
  },
];

let seed = 20260928;

function rng(): number {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function randn(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function lognormal(mean: number, cv: number): number {
  if (!(mean > 0) || !(cv > 0)) return 0;
  const s2 = Math.log(1 + cv * cv);
  return Math.exp(Math.log(mean) - 0.5 * s2 + Math.sqrt(s2) * randn());
}

function poisson(mu: number): number {
  if (!(mu > 0)) return 0;
  if (mu > 40) return Math.max(0, Math.round(mu + Math.sqrt(mu) * randn()));
  const limit = Math.exp(-mu);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= rng();
  } while (p > limit);
  return k - 1;
}

function binomial(n: number, p: number): number {
  let k = 0;
  for (let i = 0; i < n; i += 1) if (rng() < p) k += 1;
  return k;
}

function stat(proc: Proc, dropbacks: number): number {
  if (proc.kind === "pass") return lognormal(dropbacks * proc.rate, 0.16);
  if (proc.kind === "rush") {
    const att = poisson(lognormal(proc.volume, 0.22));
    let yards = 0;
    for (let i = 0; i < att; i += 1) yards += lognormal(proc.rate, proc.rateCv);
    return yards;
  }
  const targets = poisson(Math.max(0, dropbacks) * proc.volume * lognormal(1, 0.12));
  const catches = binomial(targets, proc.catchP);
  if (proc.kind === "rec") return catches;
  let yards = 0;
  for (let i = 0; i < catches; i += 1) yards += Math.max(0, lognormal(proc.rate, proc.rateCv));
  return yards;
}

function cleared(proc: Proc, value: number): boolean {
  if (proc.kind === "rec") return value >= Math.floor(proc.line) + 1;
  return value > proc.line;
}

export type SimDraw = {
  hits: boolean[];
  values: number[];
  blowout: boolean;
  close: boolean;
};

export function drawGame(): SimDraw {
  const margin = 3.5 + 13.5 * randn();
  const pace = Math.exp(0.08 * randn() - 0.5 * 0.08 * 0.08);
  let phiAtt = 32 * pace * Math.exp(0.14 * randn() - 0.5 * 0.14 * 0.14);
  let chiAtt = 28 * pace * Math.exp(0.18 * randn() - 0.5 * 0.18 * 0.18);
  if (margin >= 14) {
    phiAtt *= 0.88;
    chiAtt *= 1.1;
  } else if (margin <= -7) {
    phiAtt *= 1.08;
    chiAtt *= 0.92;
  }
  const values = CANDIDATES.map((proc) => stat(proc, proc.side === "PHI" ? phiAtt : chiAtt));
  return {
    values,
    hits: values.map((value, i) => cleared(CANDIDATES[i], value)),
    blowout: margin >= 17,
    close: Math.abs(margin) <= 8,
  };
}

function rate(draws: SimDraw[], idxs: number[], pred?: (d: SimDraw) => boolean): number {
  let n = 0;
  let hits = 0;
  for (const draw of draws) {
    if (pred && !pred(draw)) continue;
    n += 1;
    if (idxs.every((i) => draw.hits[i])) hits += 1;
  }
  return n ? hits / n : 0;
}

function choose(draws: SimDraw[]): number[] {
  const marginal = CANDIDATES.map((_, i) => draws.reduce((s, d) => s + (d.hits[i] ? 1 : 0), 0) / draws.length);
  let best: number[] = [];
  let bestSweep = -1;
  let bestMin = -1;
  const walk = (start: number, picked: number[]) => {
    if (picked.length === 4) {
      const names = new Set(picked.map((i) => CANDIDATES[i].player));
      if (names.size < 4) return;
      const phi = picked.filter((i) => CANDIDATES[i].team === "PHI").length;
      if (phi !== 2) return;
      const min = Math.min(...picked.map((i) => marginal[i] ?? 0));
      if (min < 0.57) return;
      const sweep = rate(draws, picked);
      if (sweep > bestSweep + 1e-6 || (Math.abs(sweep - bestSweep) < 1e-6 && min > bestMin)) {
        bestSweep = sweep;
        bestMin = min;
        best = [...picked];
      }
      return;
    }
    for (let i = start; i < CANDIDATES.length; i += 1) walk(i + 1, [...picked, i]);
  };
  walk(0, []);
  return best;
}

function meanOf(draws: SimDraw[], index: number): number {
  let s = 0;
  for (const draw of draws) s += draw.values[index] ?? 0;
  return s / draws.length;
}

export function simulateMonday(sims = 20000): MondayReport {
  seed = 20260928;
  const draws: SimDraw[] = [];
  for (let i = 0; i < sims; i += 1) draws.push(drawGame());
  const chosen = choose(draws);
  const legs: MondayLeg[] = chosen.map((index) => {
    const proc = CANDIDATES[index];
    const p = draws.reduce((s, d) => s + (d.hits[index] ? 1 : 0), 0) / draws.length;
    return {
      id: proc.id,
      player: proc.player,
      team: proc.team,
      pos: proc.pos,
      label: proc.label,
      line: proc.line,
      mean: meanOf(draws, index),
      p,
      why: proc.why,
    };
  });
  return {
    detail: "Eagles at Bears · 8:15 PM ET · Soldier Field",
    spread: "PHI -3.5",
    total: 41.5,
    sims,
    blowout: draws.filter((d) => d.blowout).length / draws.length,
    oneScore: draws.filter((d) => d.close).length / draws.length,
    legs,
    sweep: rate(draws, chosen),
    sweepIfBlowout: rate(draws, chosen, (d) => d.blowout),
    sweepIfClose: rate(draws, chosen, (d) => d.close),
    traps: [
      "Barkley under 72.5 is a bad read. Week 2 was a stinger, four carries for 9 yards. Week 1 healthy was 15 for 83. The model that spits out 34 yards is fitting the injury, not the role.",
      "Mundt’s receiving yards are Goedert’s vacated targets parked on the wrong name. Ertz is the replacement and has no 2026 Eagles sample.",
      "Odunze over 25.5 belongs to Caleb Williams. Keenum has not started a game since 2023. That over is off the card.",
    ],
    script:
      "A 17-point Eagles win is about a one-in-six game, not the base case. The four legs need Philadelphia to throw a normal amount and Chicago to complete underneath. If Philadelphia blows it open, Hurts sits and Keenum throws more, so the Bears legs get healthier and the Eagles legs get worse.",
  };
}

let cached: MondayReport | null = null;

export function mondayReport(): MondayReport {
  if (!cached) cached = simulateMonday(16000);
  return cached;
}
