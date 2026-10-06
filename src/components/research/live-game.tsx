import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { GameResearch, ResearchSport } from "@/lib/research/workbench";
import { isStale, mapUrls } from "@/lib/research/live";
import { loadVenueCoordinates } from "@/lib/research/workbench-functions";

export function Freshness({
  at,
  running,
  interval,
  fetching,
  error,
}: {
  at?: string;
  running: boolean;
  interval: number;
  fetching: boolean;
  error: boolean;
}) {
  const [now, setNow] = useState(Date.now);
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      clearInterval(tick);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  const age = at ? Math.max(0, Math.floor((now - Date.parse(at)) / 1000)) : null;
  const stale = isStale(at, interval, now);
  const label = !online
    ? "Offline · showing last snapshot"
    : !running
      ? "Auto-refresh paused"
      : error
        ? "Refresh failed · retrying"
        : stale && at
          ? "Source snapshot is stale"
          : fetching
            ? "Fetching ESPN…"
            : "Auto-refresh on";
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs" role="status">
      <span
        className={`size-2 rounded-full ${!online || error || stale ? "bg-amber-400" : running ? "bg-pine" : "bg-muted"}`}
      />
      <span>{label}</span>
      <span className="text-muted">
        {age !== null && Number.isFinite(age) ? `· fetched ${age}s ago` : "· awaiting source"}{" "}
        {running ? `· every ${interval / 1000}s` : ""}
      </span>
    </div>
  );
}

export function LiveGame({ detail, sport }: { detail: GameResearch; sport: ResearchSport }) {
  const [scoring, setScoring] = useState(false);
  const live = detail.live;
  if (!live) return <p className="text-sm text-muted">Refresh to load live game details.</p>;
  const pitches = live.plays.filter((p) => p.pitch);
  const lastAtBat = pitches[0]?.atBat;
  const currentPitches = pitches
    .filter((p) => (lastAtBat ? p.atBat === lastAtBat : true))
    .slice(0, 30)
    .reverse();
  const visible = live.plays.filter((p) => !scoring || p.scoring).slice(0, 100);
  const yards = live.plays
    .filter((p) => p.start !== null && p.end !== null)
    .slice(0, 10)
    .reverse();
  const points = live.winProbability;
  const home = detail.game.teams.find((t) => t.side === "home")?.code || "Home";
  const zone = live.zone;
  const minX = Math.min(zone?.x ?? 80, ...currentPitches.map((p) => p.pitch!.x)) - 30,
    minY = Math.min(zone?.y ?? 120, ...currentPitches.map((p) => p.pitch!.y)) - 30;
  const maxX =
      Math.max((zone?.x ?? 80) + (zone?.width ?? 80), ...currentPitches.map((p) => p.pitch!.x)) +
      30,
    maxY =
      Math.max((zone?.y ?? 120) + (zone?.height ?? 80), ...currentPitches.map((p) => p.pitch!.y)) +
      30;
  return (
    <div className="space-y-5">
      <div>
        <p className="desk-eyebrow">
          {detail.game.state === "post"
            ? "Final game replay"
            : detail.game.state === "in"
              ? "Live game center"
              : "Game center"}
        </p>
        <h4 className="mt-2 text-2xl font-medium">
          {live.period || detail.game.status || "Waiting for game data"}
        </h4>
        <p className="mt-2 text-xs text-muted">
          Scores, plays, and player box scores refresh together. ESPN may revise or delay its feed.
        </p>
      </div>
      {sport === "mlb" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface p-4">
            <h5 className="text-sm font-medium">Last reported base state</h5>
            <svg
              viewBox="0 0 260 200"
              className="mx-auto h-48 w-full max-w-72"
              role="img"
              aria-label={`Bases: first ${live.situation.bases[0] ?? "unknown"}, second ${live.situation.bases[1] ?? "unknown"}, third ${live.situation.bases[2] ?? "unknown"}`}
            >
              <path
                d="M130 172 L38 80 Q130 -14 222 80 Z"
                fill="currentColor"
                className="text-pine/10"
              />
              <path
                d="M130 166 L205 91 L130 16 L55 91 Z"
                fill="none"
                stroke="currentColor"
                className="text-muted/40"
              />
              {[
                [205, 91],
                [130, 16],
                [55, 91],
              ].map(([x, y], i) => (
                <g key={i}>
                  <rect
                    x={x - 7}
                    y={y - 7}
                    width="14"
                    height="14"
                    transform={`rotate(45 ${x} ${y})`}
                    fill={live.situation.bases[i] === true ? "currentColor" : "none"}
                    stroke="currentColor"
                    className={live.situation.bases[i] === null ? "text-muted/30" : "text-pine"}
                  />
                  <text
                    x={x}
                    y={y + 27}
                    textAnchor="middle"
                    fill="currentColor"
                    className="text-muted"
                    fontSize="10"
                  >
                    {i + 1}
                    {live.situation.bases[i] === null ? " ?" : ""}
                  </text>
                </g>
              ))}
              <path
                d="M123 165 L137 165 L137 172 L130 178 L123 172 Z"
                fill="currentColor"
                className="text-pine"
              />
            </svg>
            <p className="text-center font-mono text-sm">
              B {live.situation.balls ?? "—"} · S {live.situation.strikes ?? "—"} · Outs{" "}
              {live.situation.outs ?? "—"}
            </p>
            <p className="mt-2 text-center text-[11px] text-muted">
              Filled = occupied · ? = not supplied
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4">
            <h5 className="text-sm font-medium">Latest available at-bat · pitch map</h5>
            {currentPitches.length ? (
              <>
                <svg
                  viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
                  className="h-48 w-full"
                  role="img"
                  aria-label={`${currentPitches.length} reported pitch locations`}
                >
                  {zone && (
                    <>
                      {[0, 1, 2].flatMap((x) =>
                        [0, 1, 2].map((y) => (
                          <rect
                            key={`${x}-${y}`}
                            x={zone.x + (x * zone.width) / 3}
                            y={zone.y + (y * zone.height) / 3}
                            width={zone.width / 3}
                            height={zone.height / 3}
                            stroke="currentColor"
                            fill="none"
                            strokeWidth=".8"
                            className="text-muted/40"
                          />
                        )),
                      )}
                    </>
                  )}
                  {currentPitches.map((p, i) => (
                    <g key={p.id}>
                      <title>
                        {i + 1}. {p.text} · {p.pitch!.kind} · {p.pitch!.velocity ?? "—"} mph
                      </title>
                      <circle
                        cx={p.pitch!.x}
                        cy={p.pitch!.y}
                        r="6"
                        fill="currentColor"
                        className="text-pine"
                      />
                      <text
                        x={p.pitch!.x}
                        y={p.pitch!.y + 2.5}
                        textAnchor="middle"
                        fill="#10170f"
                        fontSize="7"
                      >
                        {i + 1}
                      </text>
                    </g>
                  ))}
                </svg>
                <p className="text-[11px] text-muted">
                  ESPN chart coordinates.{" "}
                  {zone ? "Zone outline from source hot-zone grid." : "Zone outline unavailable."}{" "}
                  Not a 3D trajectory.
                </p>
                <ol className="mt-3 space-y-1 text-xs text-muted">
                  {currentPitches.map((p, i) => (
                    <li key={p.id}>
                      {i + 1}. {p.pitch!.kind || p.text} · {p.pitch!.velocity ?? "—"} mph · count{" "}
                      {p.pitch!.count}
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <p className="mt-5 text-sm text-muted">
                Pitch coordinates have not been supplied for this game.
              </p>
            )}
          </div>
        </div>
      )}
      {sport === "nfl" && (
        <section className="rounded-xl border border-border bg-surface p-4">
          <h5 className="text-sm font-medium">Recent play field positions</h5>
          <p className="mt-2 text-xs text-muted">
            Each row runs from the offense’s goal line to the opponent’s goal line. Source start/end
            positions; turnovers without a consistent possession frame are omitted.
          </p>
          {yards.length ? (
            <svg
              viewBox={`0 0 620 ${60 + yards.length * 30}`}
              className="mt-3 w-full"
              role="img"
              aria-label="Last ten plays with reported start and end field positions"
            >
              <rect
                x="50"
                y="30"
                width="520"
                height={yards.length * 30 + 10}
                fill="currentColor"
                className="text-pine/10"
              />
              {Array.from({ length: 11 }, (_, i) => (
                <g key={i}>
                  <line
                    x1={50 + i * 52}
                    x2={50 + i * 52}
                    y1="30"
                    y2={40 + yards.length * 30}
                    stroke="currentColor"
                    className="text-muted/20"
                  />
                  <text
                    x={50 + i * 52}
                    y="20"
                    textAnchor="middle"
                    fill="currentColor"
                    fontSize="9"
                    className="text-muted"
                  >
                    {i === 0 ? "Own goal" : i === 10 ? "Opp. goal" : i * 10}
                  </text>
                </g>
              ))}
              {yards.map((p, i) => (
                <g key={p.id}>
                  <title>{p.text}</title>
                  <text
                    x="6"
                    y={52 + i * 30}
                    fill="currentColor"
                    className="text-muted"
                    fontSize="9"
                  >
                    {p.clock}
                  </text>
                  <line
                    x1={50 + (100 - p.start!) * 5.2}
                    x2={50 + (100 - p.end!) * 5.2}
                    y1={48 + i * 30}
                    y2={48 + i * 30}
                    stroke="currentColor"
                    strokeWidth="5"
                    className={p.scoring ? "text-amber-400" : "text-pine"}
                  />
                  <circle
                    cx={50 + (100 - p.end!) * 5.2}
                    cy={48 + i * 30}
                    r="4"
                    fill="currentColor"
                    className="text-pine"
                  />
                </g>
              ))}
            </svg>
          ) : (
            <p className="mt-4 text-sm text-muted">
              No consistent field-position coordinates supplied yet.
            </p>
          )}
        </section>
      )}
      {points.length > 1 && (
        <section className="rounded-xl border border-border p-4">
          <div className="flex justify-between gap-3">
            <h5 className="text-sm font-medium">{home} win probability · ESPN</h5>
            <span className="font-mono text-sm text-pine">
              {(points.at(-1)!.home * 100).toFixed(1)}%
            </span>
          </div>
          <svg
            viewBox="0 0 600 110"
            className="mt-3 h-28 w-full"
            role="img"
            aria-label={`${home} source win-probability trend, ${points.length} samples`}
          >
            <line
              x1="0"
              x2="600"
              y1="55"
              y2="55"
              stroke="currentColor"
              strokeDasharray="4 4"
              className="text-muted/30"
            />
            <polyline
              points={points
                .map((p, i) => `${(i / (points.length - 1)) * 600},${105 - p.home * 100}`)
                .join(" ")}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-pine"
            />
          </svg>
          <p className="text-[11px] text-muted">
            Source-provided estimates by play order, not our betting model.
          </p>
        </section>
      )}
      <section>
        <div className="flex items-center justify-between gap-3">
          <h5 className="text-sm font-medium">Play-by-play</h5>
          <label className="flex gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={scoring}
              onChange={(e) => setScoring(e.target.checked)}
            />
            Scoring only
          </label>
        </div>
        <p className="mt-2 text-[11px] text-muted">
          Newest first · up to 100 of the latest 300 plays returned
        </p>
        {visible.length ? (
          <ol className="mt-3 max-h-[440px] overflow-auto divide-y divide-border">
            {visible.map((p) => (
              <li key={p.id} className="py-3">
                <div className="flex justify-between gap-3 text-[10px] text-muted">
                  <span>
                    {p.period} {p.clock}
                  </span>
                  <span>
                    {p.awayScore || "—"}–{p.homeScore || "—"}
                    {p.scoring ? " · SCORE" : ""}
                  </span>
                </div>
                <p
                  className={`mt-1 text-sm leading-relaxed ${p.scoring ? "text-pine" : "text-fg"}`}
                >
                  {p.text}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-4 text-sm text-muted">
            {scoring
              ? "No scoring plays returned in this window."
              : "Play-by-play is not available from this feed yet."}
          </p>
        )}
      </section>
    </div>
  );
}

export function VenueView({ detail, sport }: { detail: GameResearch; sport: ResearchSport }) {
  const venue = detail.venueMap;
  const name = venue?.name || detail.game.venue;
  const coordinates = useQuery({
    queryKey: ["venue-coordinates", name],
    queryFn: () => loadVenueCoordinates({ data: { name } }),
    enabled: sport === "mlb" && Boolean(name),
    staleTime: 86_400_000,
    retry: 1,
  });
  const point = coordinates.data?.coordinates;
  const urls = point ? mapUrls(point.lat, point.lon) : null;
  const search = `https://www.openstreetmap.org/search?query=${encodeURIComponent([name, venue?.address].filter(Boolean).join(", "))}`;
  return (
    <section className="space-y-4">
      <div>
        <p className="desk-eyebrow">Venue & location</p>
        <h4 className="mt-2 text-2xl font-medium">{name || "Venue not supplied"}</h4>
        <p className="mt-2 text-sm text-muted">{venue?.address || "Address not supplied"}</p>
      </div>
      {venue?.image && (
        <img
          src={venue.image}
          alt={`${name} venue`}
          className="max-h-64 w-full rounded-lg object-cover"
          loading="lazy"
        />
      )}
      {urls ? (
        <>
          <iframe
            title={`Map of ${name}`}
            src={urls.embed}
            className="h-80 w-full rounded-lg border border-border bg-surface"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
          <p className="text-xs text-muted">
            Venue coordinates:{" "}
            <a
              className="text-pine"
              href={coordinates.data!.source}
              target="_blank"
              rel="noreferrer"
            >
              MLB venue directory
            </a>{" "}
            · Map:{" "}
            <a
              className="text-pine"
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
            >
              © OpenStreetMap contributors
            </a>
          </p>
        </>
      ) : (
        <p className="rounded-lg border border-dashed border-border p-5 text-sm text-muted">
          {coordinates.isFetching
            ? "Looking up official venue coordinates…"
            : "Verified coordinates are not available for this venue. Open the map search below to locate it."}
        </p>
      )}
      {name && (
        <a
          className="inline-block text-sm text-pine hover:underline"
          href={urls?.full ?? search}
          target="_blank"
          rel="noreferrer"
        >
          {urls ? "Open full map" : "Find venue on OpenStreetMap"} ↗
        </a>
      )}
      <div className="rounded-lg border border-border p-4">
        <h5 className="text-sm font-medium">Reported weather</h5>
        <p className="mt-2 text-sm text-muted">{detail.weather}</p>
        <p className="mt-2 text-xs text-muted">
          Local weather is not confirmation of conditions inside the venue or roof status.
        </p>
      </div>
    </section>
  );
}
