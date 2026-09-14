import type { AnalysisResult, SlipCard, SlipLeg } from "./types";

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
      "9/11 · Seymour 10 Ks, Elly/Chourio/Mitchell/Turang/Bauers/Antonacci/Bolte/Moreno hit. Baez 0-4 and Pederson 0-3 missed 1.5 H+R+RBI. HR board went 0/10 — counting was the card.",
  },
};

export function mergeLog(user: DeskLogEntry[]): DeskLogEntry[] {
  const dates = new Set(user.map((e) => e.date));
  if (dates.has(SEP12_RECAP.date)) {
    return user.map((e) => {
      if (e.date !== SEP12_RECAP.date) return e;
      if (e.grade && e.grade.n > 0) return e;
      return { ...e, grade: SEP12_RECAP.grade, slips: e.slips?.length ? e.slips : SEP12_RECAP.slips };
    });
  }
  return [SEP12_RECAP, ...user].slice(0, 8);
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
    return { ...e, slips: g.slips, grade: g.grade };
  });
}

export function mergeLedger(db: DeskLogEntry[], local: DeskLogEntry[]): DeskLogEntry[] {
  const map = new Map<string, DeskLogEntry>();
  for (const e of db) map.set(e.date, e);
  for (const e of local) {
    const cur = map.get(e.date);
    if (!cur) {
      map.set(e.date, e);
      continue;
    }
    if (!cur.slips.length && e.slips.length) {
      map.set(e.date, { ...cur, slips: e.slips, grade: e.grade, version: e.version || cur.version });
    }
  }
  return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
}
