import type { AnalysisResult, SlipCard, SlipLeg } from "./types.ts";

export type SlateGameSnap = {
  away: string;
  home: string;
  awayScore: number | null;
  homeScore: number | null;
  state: string;
  venue: string;
};

export type DeskLogEntry = {
  date: string;
  version: string;
  slips: SlipCard[];
  grade: AnalysisResult["grade"];
  complete?: boolean;
  finals?: number;
  live?: number;
  games?: number;
  slate?: SlateGameSnap[];
  analysis?: AnalysisResult | null;
};

function leg(
  playerId: number,
  name: string,
  teamAbbr: string,
  opponentAbbr: string,
  market: SlipLeg["market"],
  stat: string,
  line: number,
  cover: number,
  score: number,
  actual: number,
  result: SlipLeg["result"],
): SlipLeg {
  return {
    playerId,
    name,
    teamAbbr,
    opponentAbbr,
    market,
    stat,
    line,
    side: "over",
    oddsType: "standard",
    score,
    lean: score >= 66 ? "strong" : score >= 54 ? "lean" : "spec",
    reason: "",
    cover,
    lineupStatus: "confirmed",
    result,
    actual,
  };
}

const sep12: SlipCard[] = [
  {
    size: 2,
    title: "Power 2",
    date: "2026-09-12",
    confidence: 76,
    lean: "strong",
    notes: "Seymour 10 Ks. Elly 2 hits + 1 RBI.",
    legs: [
      leg(693855, "Ian Seymour", "TB", "HOU", "k", "Pitcher Strikeouts", 5.5, 0.82, 62, 10, "hit"),
      leg(682829, "Elly De La Cruz", "CIN", "MIL", "hrrbi", "Hits+Runs+RBIs", 1.5, 0.7, 78, 3, "hit"),
    ],
  },
  {
    size: 3,
    title: "Core 3",
    date: "2026-09-12",
    confidence: 56,
    lean: "lean",
    notes: "Chourio 2 runs. Baez 0-4. Moreno 2 hits + 1 run.",
    legs: [
      leg(694192, "Jackson Chourio", "MIL", "CIN", "runs", "Runs", 0.5, 0.59, 82, 2, "hit"),
      leg(695491, "Joshua Báez", "STL", "CWS", "hrrbi", "Hits+Runs+RBIs", 1.5, 0.57, 64, 0, "miss"),
      leg(672515, "Gabriel Moreno", "AZ", "TEX", "hrrbi", "Hits+Runs+RBIs", 1.5, 0.52, 62, 3, "hit"),
    ],
  },
  {
    size: 6,
    title: "Flex 6",
    date: "2026-09-12",
    confidence: 58,
    lean: "lean",
    notes: "MIL 13-run game carried Mitchell, Turang, Bauers. Pederson 0-3.",
    legs: [
      leg(669003, "Garrett Mitchell", "MIL", "CIN", "hrrbi", "Hits+Runs+RBIs", 1.5, 0.67, 63, 10, "hit"),
      leg(668930, "Brice Turang", "MIL", "CIN", "runs", "Runs", 0.5, 0.55, 80, 2, "hit"),
      leg(592626, "Joc Pederson", "TEX", "AZ", "hrrbi", "Hits+Runs+RBIs", 1.5, 0.6, 55, 0, "miss"),
      leg(641343, "Jake Bauers", "MIL", "CIN", "hrrbi", "Hits+Runs+RBIs", 1.5, 0.56, 70, 5, "hit"),
      leg(803011, "Sam Antonacci", "CWS", "STL", "hrrbi", "Hits+Runs+RBIs", 1.5, 0.52, 50, 3, "hit"),
      leg(703607, "Henry Bolte", "ATH", "SEA", "hrrbi", "Hits+Runs+RBIs", 1.5, 0.55, 50, 2, "hit"),
    ],
  },
];

const sep18: SlipCard[] = [
  {
    size: 2,
    title: "Power 2",
    date: "2026-09-18",
    confidence: 76,
    lean: "strong",
    notes: "Seymour 5 Ks, needed 6. Pivetta 4 Ks in 5 IP, needed 5. Both undershot.",
    legs: [
      leg(693855, "Ian Seymour", "TB", "BOS", "k", "Pitcher Strikeouts", 5.5, 0.85, 69, 5, "miss"),
      leg(601713, "Nick Pivetta", "SD", "MIA", "k", "Pitcher Strikeouts", 5, 0.68, 56, 4, "miss"),
    ],
  },
  {
    size: 3,
    title: "Core 3",
    date: "2026-09-18",
    confidence: 56,
    lean: "lean",
    notes: "Prielipp 8 Ks. Elly 2 runs. Grichuk 1 fantasy, needed 3.5.",
    legs: [
      leg(687570, "Connor Prielipp", "MIN", "LAA", "k", "Pitcher Strikeouts", 5.5, 0.53, 50, 8, "hit"),
      leg(682829, "Elly De La Cruz", "CIN", "CHC", "runs", "Runs", 0.5, 0.53, 72, 2, "hit"),
      leg(545341, "Randal Grichuk", "CWS", "DET", "fs", "Hitter Fantasy Score", 3.5, 0.61, 53, 1, "miss"),
    ],
  },
  {
    size: 6,
    title: "Flex 6",
    date: "2026-09-18",
    confidence: 0,
    lean: "spec",
    notes: "Flex skip — not a loss.",
    skip: true,
    legs: [],
  },
];

const sep19: SlipCard[] = [
  {
    size: 2,
    title: "Power 2",
    date: "2026-09-19",
    confidence: 0,
    lean: "spec",
    notes: "Power skip — PrizePicks was 6.5+ K demons. Skubal 3 Ks in 5 IP.",
    skip: true,
    legs: [],
  },
  {
    size: 3,
    title: "Core 3",
    date: "2026-09-19",
    confidence: 0,
    lean: "spec",
    notes: "Core skip — not a loss.",
    skip: true,
    legs: [],
  },
  {
    size: 6,
    title: "Flex 6",
    date: "2026-09-19",
    confidence: 0,
    lean: "spec",
    notes: "Flex skip — not a loss.",
    skip: true,
    legs: [],
  },
];

/** In-game Friday 3.1 Great Run 12 — freeze at first pitch, grade from boxes. */
export const SEP18_HR_IDS = [
  670541, // Yordan Alvarez
  703155, // Lazaro Montes
  691718, // Pete Crow-Armstrong
  696100, // Hunter Goodman
  656941, // Kyle Schwarber
  624413, // Pete Alonso
  545341, // Randal Grichuk
  665161, // Jeremy Peña
  621566, // Matt Olson
  808959, // Munetaka Murakami
  700250, // Ben Rice
  806956, // Ethan Salas
];

/** Last pre-first-pitch Saturday 3.3 Great Run 12 — freeze, grade from boxes. */
export const SEP19_HR_IDS = [
  670541, // Yordan Alvarez
  691718, // Pete Crow-Armstrong
  696100, // Hunter Goodman
  682829, // Elly De La Cruz
  666176, // Jo Adell
  656941, // Kyle Schwarber
  621566, // Matt Olson
  691723, // Coby Mayo
  663728, // Cal Raleigh
  673548, // Seiya Suzuki
  691406, // Junior Caminero
  669127, // Shea Langeliers
];

/** Friday 9/18 model 3.1 card, graded from MLB box scores. */
export const SEP18_RECAP: DeskLogEntry = {
  date: "2026-09-18",
  version: "3.1",
  slips: sep18,
  grade: {
    hits: 2,
    n: 5,
    dnp: 0,
    summary:
      "2/5 · Power 2 LOSS (Seymour 5, Pivetta 4). Core 3 LOSS (Grichuk FS 1). Flex skip. Great Run board 4 of 12 yard — Montes, Alonso, Olson, Rice — vs 3.6 expected.",
  },
};

/** Saturday 9/19 model 3.3 skip. Great Run 12 graded from boxes. */
export const SEP19_RECAP: DeskLogEntry = {
  date: "2026-09-19",
  version: "3.3",
  slips: sep19,
  grade: {
    hits: 0,
    n: 0,
    dnp: 0,
    summary:
      "Skip — not a loss. PrizePicks was 6.5+ K demons. Skubal 3 Ks in 5 IP, Detmers 5 vs 6.5. Great Run board 1 of 12 — Raleigh at Coors — vs 3.4 expected. 34 HR on the slate.",
  },
};

/** Saturday 9/12 model 1.9 card, graded from MLB box scores. */
export const SEP12_RECAP: DeskLogEntry = {
  date: "2026-09-12",
  version: "1.9",
  slips: sep12,
  grade: {
    hits: 9,
    n: 11,
    dnp: 0,
    summary:
      "9/11 · Power 2 CASH 3x, Core 3 LOSS (Báez), Flex 6 5/6 for 2x. +2.0u on 3u staked. Baez 0-4 and Pederson 0-3 missed 1.5 H+R+RBI. HR board went 0/10 — counting was the card.",
  },
};

export function mergeLog(user: DeskLogEntry[]): DeskLogEntry[] {
  const extras = [SEP12_RECAP, SEP18_RECAP, SEP19_RECAP];
  const map = new Map(user.map((e) => [e.date, e]));
  for (const extra of extras) {
    const cur = map.get(extra.date);
    if (!cur) {
      map.set(extra.date, extra);
      continue;
    }
    const posted = cur.slips.filter((s) => !s.skip && s.legs.length > 0);
    if (!posted.length) {
      map.set(extra.date, {
        ...cur,
        slips: extra.slips,
        grade: extra.grade,
        version: extra.version,
      });
    } else if (!cur.grade || cur.grade.n === 0) {
      map.set(extra.date, { ...cur, grade: extra.grade });
    }
  }
  return [...map.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
}

export function entryPending(entry: DeskLogEntry): boolean {
  const legs = entry.slips.flatMap((s) => s.legs);
  if (!legs.length) return false;
  return legs.some((l) => !l.result || l.result === "pending");
}

export function pendingCards(log: DeskLogEntry[], today: string): { date: string; slips: SlipCard[] }[] {
  return log
    .filter((e) => e.date <= today && entryPending(e))
    .map((e) => ({ date: e.date, slips: e.slips }));
}

export function ledgerRate(log: DeskLogEntry[]): { hits: number; n: number; dnp: number; cards: number } {
  let hits = 0;
  let n = 0;
  let dnp = 0;
  let cards = 0;
  for (const e of log) {
    if (!e.grade || e.grade.n + e.grade.dnp === 0) continue;
    hits += e.grade.hits;
    n += e.grade.n;
    dnp += e.grade.dnp;
    cards += 1;
  }
  return { hits, n, dnp, cards };
}

export function applyGrades(
  log: DeskLogEntry[],
  graded: Array<{ date: string; slips: SlipCard[]; grade: DeskLogEntry["grade"] }>,
): DeskLogEntry[] {
  const byDate = new Map(graded.map((g) => [g.date, g]));
  return log.map((e) => {
    const g = byDate.get(e.date);
    if (!g) return e;
    return {
      ...e,
      slips: g.slips,
      grade: g.grade,
      analysis: e.analysis ? { ...e.analysis, slips: g.slips, grade: g.grade } : e.analysis,
    };
  });
}

export function mergeLedger(db: DeskLogEntry[], local: DeskLogEntry[]): DeskLogEntry[] {
  const map = new Map<string, DeskLogEntry>();
  for (const e of db) map.set(e.date, e);
  for (const e of local) {
    const cur = map.get(e.date);
    if (!cur) {
      // Server already enumerated the 7-day window. Do not resurrect phone-only losing cards.
      if (db.length) continue;
      map.set(e.date, e);
      continue;
    }
    // Official empty day = skip. Phone localStorage used to fill those with leftover 1.5s and grade them as losses.
    if (!cur.slips.length) continue;
    if (e.slips.length && e.grade && (!cur.grade || cur.grade.n === 0) && !entryPending(e)) {
      map.set(e.date, {
        ...cur,
        slips: e.slips,
        grade: e.grade,
        version: e.version || cur.version,
        analysis: cur.analysis ?? e.analysis,
      });
    }
  }
  return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export function isSkipDay(entry: DeskLogEntry): boolean {
  const posted = entry.slips.filter((s) => !s.skip && s.legs.length > 0);
  if (posted.length) return false;
  const summary = entry.grade?.summary?.toLowerCase() ?? "";
  return summary.includes("skip") || summary.includes("no card") || Boolean(entry.slate?.length) || entry.slips.every((s) => s.skip || !s.legs.length);
}

/** Great Run board vs boxes. Sept 8–17 is season-rate; Sept 18 is live 3.1; Sept 19 is live 3.3. */
export const HR_LOOKBACK: Array<{ date: string; hits: number; n: number; expected: number; random: number; slateHr: number }> = [
  { date: "2026-09-08", hits: 3, n: 12, expected: 3.4, random: 1.2, slateHr: 38 },
  { date: "2026-09-09", hits: 4, n: 12, expected: 3.4, random: 1.5, slateHr: 45 },
  { date: "2026-09-10", hits: 1, n: 12, expected: 3.0, random: 0.7, slateHr: 8 },
  { date: "2026-09-11", hits: 4, n: 12, expected: 3.4, random: 1.1, slateHr: 31 },
  { date: "2026-09-12", hits: 2, n: 12, expected: 3.3, random: 1.5, slateHr: 46 },
  { date: "2026-09-13", hits: 4, n: 12, expected: 3.3, random: 1.3, slateHr: 40 },
  { date: "2026-09-14", hits: 2, n: 12, expected: 3.3, random: 1.4, slateHr: 24 },
  { date: "2026-09-15", hits: 3, n: 12, expected: 3.3, random: 1.2, slateHr: 38 },
  { date: "2026-09-16", hits: 1, n: 12, expected: 3.4, random: 0.8, slateHr: 29 },
  { date: "2026-09-17", hits: 2, n: 12, expected: 3.3, random: 0.7, slateHr: 16 },
  { date: "2026-09-18", hits: 4, n: 12, expected: 3.6, random: 1.4, slateHr: 32 },
  { date: "2026-09-19", hits: 1, n: 12, expected: 3.4, random: 1.5, slateHr: 34 },
];

