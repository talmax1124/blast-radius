/** Invoke from any scheduler with an America/New_York 08:00 daily schedule. */
const base = process.env.DESK_BASE_URL;
const secret = process.env.CRON_SECRET;
if (!base || !secret?.trim())
  throw new Error("Set DESK_BASE_URL and CRON_SECRET in the scheduler environment");
const url = new URL("/api/desk/daily", base);
if (url.protocol !== "https:") throw new Error("DESK_BASE_URL must use HTTPS");
const response = await fetch(url, {
  method: "POST",
  redirect: "error",
  headers: { Authorization: `Bearer ${secret}` },
  signal: AbortSignal.timeout(15 * 60_000),
});
if (!response.ok)
  throw new Error(
    `Daily publication failed (HTTP ${response.status}); inspect the app run history`,
  );
const result = await response.json();
if (!result.ok || !Array.isArray(result.tasks) || result.tasks.length !== 5) {
  throw new Error("Daily endpoint did not confirm all five publication tasks");
}
console.log(JSON.stringify({ date: result.date, tasks: result.tasks }, null, 2));
