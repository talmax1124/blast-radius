import { createFileRoute } from "@tanstack/react-router";
import { runDeskTick } from "@/lib/mlb/desk-tick.server";

import { cronAuthorized } from "@/lib/research/schedule";

async function handleTick(request: Request): Promise<Response> {
  if (!cronAuthorized(request.headers, process.env.CRON_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const tick = await runDeskTick();
  return Response.json(
    {
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
        legs: s.legs.map(
          (l) =>
            `${l.name} ${l.side === "over" ? "O" : "U"} ${l.line} ${l.market} ${Math.round(l.cover * 100)}% ${l.teamAbbr}`,
        ),
      })),
    },
    { status: tick.action === "error" ? 503 : 200 },
  );
}

export const Route = createFileRoute("/api/desk/tick")({
  server: {
    handlers: {
      GET: async ({ request }) => handleTick(request),
      POST: async ({ request }) => handleTick(request),
    },
  },
});
