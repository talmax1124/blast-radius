/** Hit rates against one line. Last 5/10/15, the regular season, and the preseason stay separate. */

export type Sample = { value: number; date: string; preseason: boolean };

export type HitCard = {
  line: number;
  avg: number | null;
  diff: number | null;
  l5: number | null;
  l10: number | null;
  l15: number | null;
  season: number | null;
  pre: number | null;
  streak: number;
  n10: number;
  source: "season" | "preseason";
};

function byDate(rows: Sample[]): Sample[] {
  return [...rows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

function rate(rows: Sample[], line: number): number | null {
  if (!rows.length) return null;
  const hits = rows.filter((row) => row.value > line).length;
  return hits / rows.length;
}

function streakOf(rows: Sample[], line: number): number {
  if (!rows.length) return 0;
  const over = rows[0].value > line;
  let n = 0;
  for (const row of rows) {
    if (row.value > line !== over) break;
    n += 1;
  }
  return over ? n : -n;
}

export function hitCard(line: number, recent: Sample[], season: Sample[], pre: Sample[]): HitCard {
  const window = byDate(recent);
  const last = (n: number) => window.slice(0, n);
  const ten = last(10);
  const avg = ten.length ? ten.reduce((sum, row) => sum + row.value, 0) / ten.length : null;
  return {
    line,
    avg,
    diff: avg == null ? null : avg - line,
    l5: rate(last(5), line),
    l10: rate(ten, line),
    l15: rate(last(15), line),
    season: rate(season.filter((row) => !row.preseason), line),
    pre: rate(pre.filter((row) => row.preseason), line),
    streak: streakOf(window, line),
    n10: ten.length,
    source: window[0]?.preseason ? "preseason" : "season",
  };
}

/** The half-point under the projection. 29.8 is researched at 29.5. An even 4.0 is researched at 3.5. */
export function researchLine(projection: number): number {
  if (!(projection > 0)) return 0.5;
  const under = Math.floor(projection) + 0.5;
  const line = under < projection ? under : under - 1;
  return Math.max(0.5, line);
}
