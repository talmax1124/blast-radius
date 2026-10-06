import { createFileRoute } from "@tanstack/react-router";
import { runDeskTick } from "@/lib/mlb/desk-tick.server";

function cronAuthorized(request: Request): boolean {
  if (request.headers.get("x-vercel-cron") === "1") return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function handleTick(request: Request): Promise<Response> {
  if (!cronAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const tick = await runDeskTick();
  return Response.json({
    date: tick.date,
    action: tick.action,
    note: tick.note,
    slips: tick.slips,
    pending: tick.pending,
    games: tick.games,
    finals: tick.finals,
    complete: tick.complete,
    grade: tick.grade,
    version: tick.result?.model.version ?? null,
    card: (tick.result?.slips ?? []).map((s) => ({
      title: s.title,
      notes: s.notes,
      legs: s.legs.map((l) => `${l.name} ${l.side === "over" ? "O" : "U"} ${l.line} ${l.market} ${Math.round(l.cover * 100)}% ${l.teamAbbr}`),
    })),
  });
}

export const Route = createFileRoute("/api/desk/tick")({
  server: {
    handlers: {
      GET: async ({ request }) => handleTick(request),
      POST: async ({ request }) => handleTick(request),
    },
  },
});
