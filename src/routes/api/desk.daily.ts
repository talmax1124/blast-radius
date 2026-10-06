import { createFileRoute } from "@tanstack/react-router";
import { runDailyEdition } from "@/lib/research/daily.server";
import { cronAuthorized, easternClock } from "@/lib/research/schedule";

async function handle(request: Request) {
  if (!cronAuthorized(request.headers, process.env.CRON_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  // Vercel uses UTC. Two candidate hours cover EST/EDT; only the Eastern 08 hour runs.
  // Authenticated POST allows an operator to retry failed tasks later in the day.
  if (request.method === "GET" && easternClock().hour !== 8) {
    return Response.json({ status: "outside-window", timezone: "America/New_York" });
  }
  // In-memory preview storage cannot support a reliable background publication job.
  if (!process.env.DATABASE_URL?.trim()) {
    return Response.json(
      { error: "A persistent DATABASE_URL is required for scheduled publication" },
      { status: 503 },
    );
  }
  try {
    const result = await runDailyEdition();
    return Response.json(result, { status: result.ok ? 200 : 503 });
  } catch (error) {
    console.error("Daily edition failed", error);
    return Response.json(
      { error: "Daily edition could not finish. Check server logs." },
      { status: 503 },
    );
  }
}

export const Route = createFileRoute("/api/desk/daily")({
  server: {
    handlers: { GET: ({ request }) => handle(request), POST: ({ request }) => handle(request) },
  },
});
