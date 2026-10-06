/**
 * Historical Great Run ranking vs actual home runs.
 * Run: node --experimental-strip-types src/lib/mlb/backtest-hr.ts
 */
import { parkFactors, parkRoof } from "./parks.ts";
import { recencyFlags, scoreHomeRun, type MatchupCtx, type WeekForm } from "./score.ts";
import { platoonEdge } from "./score.ts";
import type { BatterSeason, PitcherCard, SaberCard } from "./types.ts";

const UA = "GreatRun/3.1-backtest";
const DATES = ["2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13", "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17"];

async function mlb<T>(path: string): Promise<T> {
  const res = await fetch(`https://statsapi.mlb.com/api/v1${path}`, {
    headers: { Accept: "application/json", "User-Agent": UA },
    signal: AbortSignal.timeout(18000),
  });
  if (!res.ok) throw new Error(`MLB ${res.status} ${path}`);
  return (await res.json()) as T;
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

function seasonOf(stat: Record<string, unknown> | undefined): BatterSeason {
  const s = stat ?? {};
  const avg = num(s.avg);
  const slg = num(s.slg);
  return {
    pa: Math.round(num(s.plateAppearances)),
    ab: Math.round(num(s.atBats)),
    hr: Math.round(num(s.homeRuns)),
    hits: Math.round(num(s.hits)),
    avg,
    obp: num(s.obp),
    slg,
    iso: Math.max(0, slg - avg),
    ops: num(s.ops),
    rbi: Math.round(num(s.rbi)),
    runs: Math.round(num(s.runs)),
    sb: Math.round(num(s.stolenBases)),
    k: Math.round(num(s.strikeOuts)),
    tb: Math.round(num(s.totalBases)),
    babip: num(s.babip),
    abPerHr: num(s.atBatsPerHomeRun),
  };
}

function blankPitcher(id: number, name: string, stat: Record<string, unknown> = {}): PitcherCard {
  return {
    id,
    name,
    hand: (String(stat.pitchHand ?? "").startsWith("L") ? "L" : String(stat.pitchHand ?? "").startsWith("R") ? "R" : null) as PitcherCard["hand"],
    era: num(stat.era),
    hr9: num(stat.homeRunsPer9) || 1.15,
    k9: num(stat.strikeoutsPer9Inn) || 8.5,
    whip: num(stat.whip) || 1.25,
    hits9: num(stat.hitsPer9Inn) || 8.4,
    goAo: num(stat.groundOutsToAirouts) || 1,
    ip: num(stat.inningsPitched),
    hr: Math.round(num(stat.homeRuns)),
    k: Math.round(num(stat.strikeOuts)),
    gamesStarted: Math.round(num(stat.gamesStarted)),
    gamesPlayed: Math.round(num(stat.gamesPlayed) || num(stat.gamesStarted)),
    opener: false,
    xera: null,
    arsenal: [],
    vsL: null,
    vsR: null,
    sbRate: null,
    recentK9: null,
    recentIp: null,
    bf: Math.round(num(stat.battersFaced)),
    recentK: null,
    recentBf: null,
  };
}

function handOf(code: string | undefined): "L" | "R" | "S" | null {
  const c = (code ?? "").toUpperCase();
  if (c === "L") return "L";
  if (c === "R") return "R";
  if (c === "S") return "S";
  return null;
}

function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + days));
  return dt.toISOString().slice(0, 10);
}

async function runDate(date: string) {
  const sch = await mlb<{
    dates?: Array<{
      games?: Array<{
        gamePk: number;
        dayNight?: string;
        venue?: { id?: number; name?: string; location?: { elevation?: number } };
        teams?: {
          away: { team?: { id?: number; abbreviation?: string; name?: string }; probablePitcher?: { id?: number; fullName?: string } };
          home: { team?: { id?: number; abbreviation?: string; name?: string }; probablePitcher?: { id?: number; fullName?: string } };
        };
      }>;
    }>;
  }>(`/schedule?sportId=1&date=${date}&hydrate=probablePitcher,venue(location),team`);
  const games = sch.dates?.[0]?.games ?? [];
  const teamIds = [...new Set(games.flatMap((g) => [g.teams?.away.team?.id, g.teams?.home.team?.id]).filter((id): id is number => !!id))];
  const pitcherIds = games.flatMap((g) => [g.teams?.away.probablePitcher?.id, g.teams?.home.probablePitcher?.id]).filter((id): id is number => !!id);

  const splits: Array<{ player?: { id: number; fullName: string }; team?: { id: number; abbreviation?: string }; stat?: Record<string, unknown>; position?: { abbreviation?: string } }> = [];
  const lastTen = new Map<number, BatterSeason>();
  const week = new Map<number, WeekForm>();
  const start = shiftDate(date, -6);
  const end = shiftDate(date, -1);

  await Promise.all(
    teamIds.map(async (id) => {
      const [season, recent, range] = await Promise.all([
        mlb<{ stats?: Array<{ splits?: typeof splits }> }>(
          `/stats?stats=season&group=hitting&season=2026&gameType=R&sportId=1&teamId=${id}&limit=50&playerPool=all`,
        ),
        mlb<{ stats?: Array<{ splits?: typeof splits }> }>(
          `/stats?stats=lastXGames&group=hitting&season=2026&sportId=1&teamId=${id}&limit=50`,
        ).catch(() => ({ stats: [] })),
        mlb<{ stats?: Array<{ splits?: typeof splits }> }>(
          `/stats?stats=byDateRange&group=hitting&season=2026&gameType=R&sportId=1&teamId=${id}&startDate=${start}&endDate=${end}&limit=50&playerPool=all`,
        ).catch(() => ({ stats: [] })),
      ]);
      splits.push(...(season.stats?.[0]?.splits ?? []));
      for (const s of recent.stats?.[0]?.splits ?? []) {
        if (s.player?.id) lastTen.set(s.player.id, seasonOf(s.stat));
      }
      for (const s of range.stats?.[0]?.splits ?? []) {
        if (!s.player?.id || !s.stat) continue;
        week.set(s.player.id, {
          hr: Math.round(num(s.stat.homeRuns)),
          pa: Math.round(num(s.stat.plateAppearances)),
          games: Math.round(num(s.stat.gamesPlayed)),
          avg: num(s.stat.avg),
          hits: Math.round(num(s.stat.hits)),
          tb: Math.round(num(s.stat.totalBases)),
          rbi: Math.round(num(s.stat.rbi)),
          runs: Math.round(num(s.stat.runs)),
        });
      }
    }),
  );

  const batterIds = splits.map((s) => s.player?.id).filter((id): id is number => !!id);
  const allIds = [...new Set([...batterIds, ...pitcherIds])];
  const people = new Map<number, { batSide?: { code?: string }; pitchHand?: { code?: string }; stats?: Array<{ group?: { displayName?: string }; splits?: Array<{ stat?: Record<string, unknown> }> }> }>();
  for (let i = 0; i < allIds.length; i += 40) {
    const chunk = allIds.slice(i, i + 40);
    try {
      const data = await mlb<{
        people?: Array<{
          id: number;
          batSide?: { code?: string };
          pitchHand?: { code?: string };
          stats?: Array<{ group?: { displayName?: string }; splits?: Array<{ stat?: Record<string, unknown> }> }>;
        }>;
      }>(`/people?personIds=${chunk.join(",")}&hydrate=stats(group=[pitching],type=[season],season=2026)`);
      for (const p of data.people ?? []) people.set(p.id, p);
    } catch {
      /* skip chunk */
    }
  }

  const actual = new Map<number, { hr: number; name: string }>();
  await Promise.all(
    games.map(async (g) => {
      try {
        const box = await mlb<{
          teams?: {
            away?: { players?: Record<string, { person?: { id?: number; fullName?: string }; stats?: { batting?: { homeRuns?: number } } }> };
            home?: { players?: Record<string, { person?: { id?: number; fullName?: string }; stats?: { batting?: { homeRuns?: number } } }> };
          };
        }>(`/game/${g.gamePk}/boxscore`);
        for (const side of [box.teams?.away?.players, box.teams?.home?.players]) {
          for (const row of Object.values(side ?? {})) {
            const id = row.person?.id;
            const hr = Number(row.stats?.batting?.homeRuns || 0);
            if (id && hr > 0) actual.set(id, { hr, name: row.person?.fullName ?? "Player" });
          }
        }
      } catch {
        /* skip */
      }
    }),
  );

  type Row = { id: number; name: string; team: string; hrPct: number; score: number; hr: number };
  const ranked: Row[] = [];

  for (const g of games) {
    const venueId = g.venue?.id ?? 0;
    const parks = parkFactors(venueId, g.venue?.location?.elevation);
    const sides = [
      { team: g.teams?.home, opp: g.teams?.away, isHome: true },
      { team: g.teams?.away, opp: g.teams?.home, isHome: false },
    ];
    for (const { team, opp, isHome } of sides) {
      const tid = team?.team?.id;
      if (!tid) continue;
      const pool = splits.filter((s) => s.team?.id === tid && (s.position?.abbreviation !== "P" || seasonOf(s.stat).pa >= 40) && seasonOf(s.stat).pa >= 40);
      pool.sort((a, b) => seasonOf(b.stat).pa - seasonOf(a.stat).pa);
      const roster = pool.slice(0, 9);
      const pRaw = opp?.probablePitcher;
      const pPerson = pRaw?.id ? people.get(pRaw.id) : undefined;
      const pStat = pPerson?.stats?.find((x) => x.group?.displayName?.toLowerCase().includes("pitch"))?.splits?.[0]?.stat ?? {};
      const card = pRaw?.id ? blankPitcher(pRaw.id, pRaw.fullName ?? "TBD", { ...pStat, pitchHand: pPerson?.pitchHand?.code }) : null;
      if (card) card.hand = handOf(pPerson?.pitchHand?.code);
      roster.forEach((batter, i) => {
        const s = seasonOf(batter.stat);
        const batSide = handOf(people.get(batter.player?.id ?? 0)?.batSide?.code);
        const recent = lastTen.get(batter.player?.id ?? 0);
        const weekForm = week.get(batter.player?.id ?? 0) ?? null;
        const flags = recencyFlags(s, weekForm);
        const mctx: MatchupCtx = {
          pitcher: card,
          parkHr: parks.hr,
          parkHits: parks.hits,
          parkK: parks.k,
          parkSb: parks.sb,
          weather: null,
          lineupSlot: i + 1,
          platoon: platoonEdge(batSide, card?.hand ?? null),
          saber: {
            xba: s.avg,
            xslg: s.slg,
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
          } satisfies SaberCard,
          vsPitches: [],
          isHome,
          edge: {
            vsHand: null,
            vsHandCode: null,
            ha: null,
            haCode: isHome ? "h" : "a",
            fbRate: null,
            gbRate: null,
            ldRate: null,
            pullRate: null,
            sprint: null,
            hpTo1b: null,
            bolts: null,
            pitcherSbRate: null,
            catcherCs: null,
            catcherPop: null,
            catcherArm: null,
            catcherName: null,
            teamObp: null,
            pitcherVsHandHr9: card?.hr9 ?? null,
            pitcherVsHandHits9: card?.hits9 ?? null,
            pitcherVsHandK9: card?.k9 ?? null,
            pitcherK9: card?.k9 ?? null,
            pitcherWhip: card?.whip ?? null,
            pitcherXera: card?.era ?? null,
            dn: null,
            dnCode: g.dayNight === "day" ? "d" : g.dayNight === "night" ? "n" : null,
          },
          flags,
          dayNight: g.dayNight,
          roof: parkRoof(venueId),
          venueId,
          batSide,
        };
        const scored = scoreHomeRun(s, recent ? recent.hr / Math.max(recent.pa, 1) : null, mctx, weekForm);
        ranked.push({
          id: batter.player?.id ?? 0,
          name: batter.player?.fullName ?? "Player",
          team: team.team?.abbreviation ?? "MLB",
          hrPct: scored.hrPct,
          score: scored.score,
          hr: actual.get(batter.player?.id ?? 0)?.hr ?? 0,
        });
      });
    }
  }

  ranked.sort((a, b) => b.hrPct - a.hrPct || b.score - a.score);
  const unique = ranked.filter((r, i, arr) => arr.findIndex((x) => x.id === r.id) === i);
  const top = unique.slice(0, 12);
  const hits = top.filter((r) => r.hr > 0).length;
  const league = unique.filter((r) => r.hr > 0).length;
  const n = unique.length || 1;
  const random12 = 12 * (league / n);
  const expected = top.reduce((s, r) => s + r.hrPct, 0);
  const missed = [...actual.entries()]
    .filter(([id]) => !top.some((t) => t.id === id))
    .sort((a, b) => b[1].hr - a[1].hr)
    .slice(0, 4)
    .map(([, v]) => v.name.split(" ").slice(-1)[0]);
  return { date, games: games.length, hits, top, league, n, random12, expected, totalHr: [...actual.values()].reduce((s, v) => s + v.hr, 0), missed };
}

const rows = [];
for (const date of DATES) {
  const row = await runDate(date);
  rows.push(row);
  const names = row.top.map((t) => `${t.hr ? "HR" : "  "} ${t.name.split(" ").slice(-1)[0]} ${(t.hrPct * 100).toFixed(0)}%`).join(" | ");
  const miss = row.missed.length ? `  missed ${row.missed.join(", ")}` : "";
  console.log(
    `${row.date}  ${row.hits}/12 yard  exp ${row.expected.toFixed(1)}  (random ~${row.random12.toFixed(1)})  ${row.totalHr} HR slate${miss}\n  ${names}`,
  );
}
const hits = rows.reduce((s, r) => s + r.hits, 0);
const rand = rows.reduce((s, r) => s + r.random12, 0);
const exp = rows.reduce((s, r) => s + r.expected, 0);
console.log(`\nTOTAL  ${hits}/${rows.length * 12}  expected ${exp.toFixed(1)}  vs random ${rand.toFixed(1)}  lift ${((hits / Math.max(rand, 0.1) - 1) * 100).toFixed(0)}%`);
