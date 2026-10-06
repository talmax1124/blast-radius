import type { TennisMatch, TennisSide } from "./types";

function todayEt(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(now);
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { "User-Agent": "GreatRun/Board-1.0" },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`tennis ${res.status}`);
  return res.json();
}

function ranksOf(payload: unknown): Map<string, number> {
  const map = new Map<string, number>();
  const rankings = (payload as { rankings?: { ranks?: { current?: number; athlete?: { displayName?: string } }[] }[] })
    .rankings;
  for (const row of rankings?.[0]?.ranks ?? []) {
    const name = row.athlete?.displayName?.trim().toLowerCase();
    if (name && row.current) map.set(name, row.current);
  }
  return map;
}

function side(raw: unknown, ranks: Map<string, number>): TennisSide | null {
  const row = raw as { winner?: boolean; athlete?: { displayName?: string } };
  const name = row.athlete?.displayName?.trim();
  if (!name) return null;
  return { name, rank: ranks.get(name.toLowerCase()) ?? null, winner: Boolean(row.winner) };
}

export async function loadTennis(now = new Date()): Promise<TennisMatch[]> {
  const day = todayEt(now);
  const tours = ["atp", "wta"] as const;
  const matches: TennisMatch[] = [];
  for (const tour of tours) {
    const [board, ranking] = await Promise.all([
      getJson(`https://site.api.espn.com/apis/site/v2/sports/tennis/${tour}/scoreboard?dates=${day.replaceAll("-", "")}`),
      getJson(`https://site.api.espn.com/apis/site/v2/sports/tennis/${tour}/rankings`).catch(() => ({ rankings: [] })),
    ]);
    const ranks = ranksOf(ranking);
    const events = (board as { events?: unknown[] }).events ?? [];
    for (const event of events) {
      const ev = event as { name?: string; groupings?: { grouping?: { displayName?: string }; competitions?: unknown[] }[] };
      for (const group of ev.groupings ?? []) {
        if (!/singles/i.test(group.grouping?.displayName ?? "")) continue;
        for (const raw of group.competitions ?? []) {
          const c = raw as {
            id?: string;
            date?: string;
            status?: { type?: { state?: string; shortDetail?: string } };
            round?: { displayName?: string };
            notes?: { text?: string }[];
            competitors?: unknown[];
          };
          const start = c.date ?? "";
          const state = c.status?.type?.state === "in" ? "in" : c.status?.type?.state === "post" ? "post" : "pre";
          const onDay = start.slice(0, 10) === day;
          if (!onDay && state !== "in") continue;
          const players = (c.competitors ?? []).map((p) => side(p, ranks)).filter((p): p is TennisSide => p != null);
          if (players.length < 2) continue;
          matches.push({
            id: String(c.id ?? `${tour}-${players[0].name}`),
            tour: tour === "atp" ? "ATP" : "WTA",
            event: ev.name ?? tour.toUpperCase(),
            round: c.round?.displayName ?? "Match",
            state,
            detail: c.notes?.[0]?.text || c.status?.type?.shortDetail || "",
            start,
            players,
          });
        }
      }
    }
  }
  return matches;
}
