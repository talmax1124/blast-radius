import { Freshness, LiveGame, VenueView } from "./live-game";
import { SimulationLab } from "./simulation-lab";
import { LIVE_POLL_MS, pollInterval } from "@/lib/research/live";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Bookmark, ChevronLeft, ChevronRight, RefreshCw, Search } from "lucide-react";
import {
  loadGameResearch,
  loadPlayerResearch,
  loadResearchGames,
} from "@/lib/research/workbench-functions";
import {
  sampleStats,
  priorGameRows,
  type GameResearch,
  type ResearchGame,
  type ResearchPlayer,
  type ResearchSport,
  type Stat,
} from "@/lib/research/workbench";

const sports: ResearchSport[] = ["mlb", "nfl", "nba", "nhl"];
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const time = (date: string) =>
  date
    ? new Date(date).toLocaleString("en-US", {
        timeZone: "America/New_York",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Not supplied";
const shortDate = (date: string) =>
  new Date(date).toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
  });
const pct = (n: number | null) => (n == null ? "—" : `${(n * 100).toFixed(1)}%`);
const control = "rounded-md border border-border bg-surface px-3 py-2 text-sm";
type Saved = {
  key: string;
  sport: ResearchSport;
  date: string;
  gameId: string;
  player: ResearchPlayer;
  note: string;
};
function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border p-5 text-sm leading-relaxed text-muted">
      {children}
    </p>
  );
}
function Source({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-xs text-pine hover:underline"
    >
      {children}
      <ArrowUpRight className="size-3" />
    </a>
  );
}
function Stats({ stats }: { stats: Stat[] }) {
  return (
    <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-md bg-border sm:grid-cols-4">
      {stats.map((s, i) => (
        <div key={`${s.label}-${i}`} className="bg-surface p-3">
          <dt className="text-[10px] uppercase tracking-wider text-muted">{s.label}</dt>
          <dd className="mt-1 font-mono text-lg">{s.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ResearchWorkbench() {
  const [running, setRunning] = useState(true);
  const [sport, setSport] = useState<ResearchSport>("mlb");
  const [date, setDate] = useState(today);
  const [selected, setSelected] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [view, setView] = useState<"games" | "saved">("games");
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("great-run:research-watchlist:v1") ?? "[]");
      if (Array.isArray(stored))
        setSaved(
          stored
            .filter(
              (x) =>
                x &&
                sports.includes(x.sport) &&
                typeof x.key === "string" &&
                x.player?.id &&
                typeof x.note === "string",
            )
            .slice(0, 100),
        );
    } catch {
      setStorageError(true);
    }
    setStorageReady(true);
  }, []);
  useEffect(() => {
    if (storageReady)
      try {
        localStorage.setItem("great-run:research-watchlist:v1", JSON.stringify(saved));
      } catch {
        setStorageError(true);
      }
  }, [saved, storageReady]);
  const schedule = useQuery({
    queryKey: ["research-games", sport, date],
    queryFn: () => loadResearchGames({ data: { sport, date } }),
    staleTime: 10_000,
    refetchInterval: running ? LIVE_POLL_MS : false,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: running ? "always" : false,
    refetchOnReconnect: running ? "always" : false,
    retry: 1,
  });
  const games = schedule.data?.games ?? [];
  const game = games.find((g) => g.id === selected) ?? games[0];
  function moveDay(offset: number) {
    const next = new Date(`${date}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + offset);
    setDate(next.toISOString().slice(0, 10));
    setSelected(null);
  }
  function toggle(player: ResearchPlayer) {
    if (!game) return;
    const key = `${sport}:${player.id}`;
    setSaved((old) =>
      old.some((s) => s.key === key)
        ? old.filter((s) => s.key !== key)
        : [...old.slice(-99), { key, sport, date, gameId: game.id, player, note: "" }],
    );
  }
  return (
    <section className="research-workbench" aria-label="Game and player research">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="desk-eyebrow">01 / The workbench</p>
          <h2 className="mt-2 text-2xl font-medium tracking-tight">Start with the matchup.</h2>
        </div>
        <div className="flex gap-2" role="group" aria-label="Workbench view">
          {(["games", "saved"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={`${control} ${view === v ? "border-pine text-pine" : "text-muted"}`}
            >
              {v === "games" ? "Explore games" : `Watchlist · ${saved.length}`}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface/50 p-3">
        <Freshness
          at={schedule.data?.fetchedAt}
          running={running}
          interval={LIVE_POLL_MS}
          fetching={schedule.isFetching}
          error={schedule.isError}
        />
        <button
          className="rounded border border-border px-3 py-2 text-xs"
          aria-pressed={!running}
          onClick={() => {
            setRunning((v) => !v);
            if (!running) void schedule.refetch();
          }}
        >
          {running ? "Pause live updates" : "Resume live updates"}
        </button>
        <p className="w-full text-[10px] text-muted">
          Auto-refresh runs while this app is open. Background tabs may be throttled by your
          browser. Manual refresh is always available.
        </p>
      </div>
      {storageError && (
        <p role="status" className="mb-4 text-sm text-amber-400">
          Browser storage is unavailable. Notes and watchlist changes may not persist.
        </p>
      )}
      {view === "saved" ? (
        <div className="grid gap-3 md:grid-cols-2">
          {!saved.length && (
            <Empty>
              Save a player from a game to build your research watchlist. Notes stay in this
              browser.
            </Empty>
          )}
          {saved.map((item) => (
            <article key={item.key} className="panel p-5">
              <p className="desk-eyebrow">
                {item.sport.toUpperCase()} · {item.player.team} · {item.date}
              </p>
              <h3 className="mt-2 text-xl">{item.player.name}</h3>
              <label className="mt-3 block text-xs text-muted">
                Research notes
                <textarea
                  maxLength={3000}
                  className={`${control} mt-2 w-full`}
                  rows={3}
                  value={item.note}
                  onChange={(e) =>
                    setSaved((old) =>
                      old.map((s) => (s.key === item.key ? { ...s, note: e.target.value } : s)),
                    )
                  }
                  placeholder="What needs checking before the game?"
                />
              </label>
              <div className="mt-3 flex justify-between">
                <button
                  className="text-sm text-pine"
                  onClick={() => {
                    setSport(item.sport);
                    setDate(item.date);
                    setSelected(item.gameId);
                    setView("games");
                  }}
                >
                  Open saved matchup →
                </button>
                <button
                  className="text-xs text-muted"
                  onClick={() => setSaved((old) => old.filter((s) => s.key !== item.key))}
                >
                  Remove
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface/50 p-3">
            <div className="flex gap-1" role="group" aria-label="Research sport">
              {sports.map((s) => (
                <button
                  key={s}
                  aria-pressed={sport === s}
                  onClick={() => {
                    setSport(s);
                    setSelected(null);
                  }}
                  className={`rounded-md px-4 py-2 text-xs font-semibold ${sport === s ? "bg-pine text-ink" : "text-muted hover:text-fg"}`}
                >
                  {s.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                aria-label="Previous research day"
                onClick={() => moveDay(-1)}
                className="p-2"
              >
                <ChevronLeft className="size-4" />
              </button>
              <input
                aria-label="Research date"
                type="date"
                className={`${control} max-w-40`}
                value={date}
                onChange={(e) => {
                  if (e.target.value) {
                    setDate(e.target.value);
                    setSelected(null);
                  }
                }}
              />
              <button aria-label="Next research day" onClick={() => moveDay(1)} className="p-2">
                <ChevronRight className="size-4" />
              </button>
              <button
                className="text-xs text-muted"
                onClick={() => {
                  setDate(today());
                  setSelected(null);
                }}
              >
                Today
              </button>
              <button
                aria-label="Refresh research games"
                disabled={schedule.isFetching}
                onClick={() => void schedule.refetch()}
                className="p-2"
              >
                <RefreshCw className={`size-4 ${schedule.isFetching ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
          <div className="my-3 flex flex-wrap justify-between gap-2 text-[11px] text-muted">
            <span>
              {games.length} {games.length === 1 ? "game" : "games"} · {sport.toUpperCase()} · Dates
              in Eastern time
            </span>
            <span>
              ESPN ·{" "}
              {schedule.data
                ? `Retrieved ${time(schedule.data.fetchedAt)} ET`
                : "Loading schedule…"}
            </span>
          </div>
          {schedule.isError && !schedule.data ? (
            <div role="alert">
              <Empty>
                Schedule unavailable. Refresh to retry; this is not confirmation that there are no
                games.
              </Empty>
            </div>
          ) : schedule.isPending ? (
            <Empty>Loading the source schedule…</Empty>
          ) : !games.length ? (
            <Empty>
              No {sport.toUpperCase()} games returned for {date}. Choose another date or league.
            </Empty>
          ) : (
            <div className="grid items-start gap-5 xl:grid-cols-[245px_minmax(0,1fr)]">
              <nav
                aria-label="Research games"
                className="flex gap-2 overflow-x-auto pb-2 xl:max-h-[760px] xl:flex-col xl:overflow-y-auto"
              >
                {games.map((g) => (
                  <button
                    key={g.id}
                    aria-pressed={game?.id === g.id}
                    onClick={() => setSelected(g.id)}
                    className={`min-w-52 rounded-lg border p-4 text-left transition ${game?.id === g.id ? "border-pine bg-pine/5" : "border-border bg-surface hover:border-muted"}`}
                  >
                    <span
                      className={`text-[10px] uppercase tracking-wider ${g.state === "in" ? "text-pine" : "text-muted"}`}
                    >
                      {g.status || time(g.date)}
                    </span>
                    <div className="mt-3 space-y-2">
                      {g.teams.map((t) => (
                        <div key={t.id} className="flex justify-between gap-4">
                          <span className="text-sm font-medium">{t.code}</span>
                          <span className="font-mono text-sm">
                            {g.state === "pre" ? t.record || "—" : t.score || "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                    <span className="mt-3 block truncate text-[10px] text-muted">
                      {g.venue || "Venue not supplied"}
                    </span>
                  </button>
                ))}
              </nav>
              {game && (
                <GamePanel
                  key={`${sport}:${game.id}`}
                  sport={sport}
                  running={running}
                  game={game}
                  date={date}
                  saved={saved}
                  toggle={toggle}
                />
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function GamePanel({
  sport,
  running,
  game,
  date,
  saved,
  toggle,
}: {
  sport: ResearchSport;
  running: boolean;
  game: ResearchGame;
  date: string;
  saved: Saved[];
  toggle: (p: ResearchPlayer) => void;
}) {
  const [section, setSection] = useState("Live game");
  const [search, setSearch] = useState("");
  const [starters, setStarters] = useState(false);
  const [selected, setSelected] = useState<ResearchPlayer | null>(null);
  const query = useQuery({
    queryKey: ["game-research", sport, game.id],
    queryFn: () => loadGameResearch({ data: { sport, id: game.id } }),
    staleTime: 10_000,
    refetchInterval: (q) => pollInterval(q.state.data?.game.state || game.state, running),
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: running ? "always" : false,
    refetchOnReconnect: running ? "always" : false,
    retry: 1,
  });
  const detail = query.data;
  const refetchGame = query.refetch;
  useEffect(() => {
    if (running) void refetchGame();
  }, [running, refetchGame]);
  const players = (detail?.players ?? []).filter(
    (p) =>
      (!starters || p.starter) &&
      `${p.name} ${p.team} ${p.position}`.toLowerCase().includes(search.toLowerCase()),
  );
  const teams = detail?.game.teams.length
    ? detail.game.teams.map((t) => ({
        ...t,
        record: t.record || game.teams.find((g) => g.id === t.id)?.record || "",
      }))
    : game.teams;
  return (
    <div className="min-w-0 rounded-xl border border-border bg-surface/30">
      <header className="border-b border-border p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="desk-eyebrow">Matchup dossier · {sport.toUpperCase()}</p>
          <button
            className="text-xs text-muted"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            {query.isFetching ? "Updating…" : "Refresh details"}
          </button>
        </div>
        <h3 className="mt-3 text-2xl font-medium tracking-tight sm:text-3xl">{game.name}</h3>
        <p className="mt-2 text-xs text-muted">
          {detail?.game.status || game.status} · {game.venue || "Venue not supplied"} ·{" "}
          {time(game.date)} ET
        </p>
        <div className="mt-3">
          <Freshness
            at={detail?.fetchedAt}
            running={running}
            interval={pollInterval(detail?.game.state || game.state) || 60_000}
            fetching={query.isFetching}
            error={query.isError}
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {teams.map((t) => (
            <span key={t.id} className="rounded border border-border px-3 py-1.5 text-xs">
              {t.code}{" "}
              <span className="ml-2 font-mono">
                {(detail?.game.state || game.state) === "pre"
                  ? t.record || "Record unavailable"
                  : t.score}
              </span>
            </span>
          ))}
        </div>
      </header>
      <div
        role="group"
        aria-label="Game research sections"
        className="flex gap-1 overflow-x-auto border-b border-border px-4"
      >
        {[
          "Live game",
          "Players",
          "Availability",
          "Markets",
          "Team stats",
          "Venue map",
          "Reports",
        ].map((s) => (
          <button
            key={s}
            onClick={() => setSection(s)}
            aria-pressed={section === s}
            className={`whitespace-nowrap border-b-2 px-3 py-4 text-xs ${section === s ? "border-pine text-pine" : "border-transparent text-muted"}`}
          >
            {s}
            {s === "Availability" && detail ? ` · ${detail.injuries.length}` : ""}
          </button>
        ))}
      </div>
      <div className="space-y-5 p-4 sm:p-6">
        {query.isPending && <Empty>Reading lineups, availability, markets, and box scores…</Empty>}
        {query.isError && (
          <div role="alert">
            <Empty>Game details could not load. Use Refresh details to retry.</Empty>
          </div>
        )}
        {detail && (
          <>
            {(detail.warnings ?? []).map((warning, i) => (
              <p key={i} className="rounded border border-amber-400/20 p-3 text-xs text-amber-400">
                {warning}
              </p>
            ))}
            {section === "Live game" && <LiveGame detail={detail} sport={sport} />}
            {section === "Venue map" && <VenueView detail={detail} sport={sport} />}
            {section === "Players" && (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <label className={`${control} flex min-w-0 flex-1 items-center gap-2`}>
                    <Search className="size-4 text-muted" />
                    <input
                      aria-label="Search matchup players"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Find a player, team, or position"
                      className="min-w-0 flex-1 bg-transparent"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs text-muted">
                    <input
                      type="checkbox"
                      checked={starters}
                      onChange={(e) => setStarters(e.target.checked)}
                    />
                    Reported starters
                  </label>
                </div>
                <p className="text-xs leading-relaxed text-muted">
                  {detail.players.length} players returned. Starter flags and batting order come
                  from the game feed; unmarked players are not confirmed inactive. Stats below are
                  this game’s box score.
                </p>
                {selected && (
                  <PlayerPanel
                    key={`${selected.id}:${game.season ?? detail.game.season}`}
                    player={detail.players.find((p) => p.id === selected.id) ?? selected}
                    sport={sport}
                    date={date}
                    season={game.season ?? detail.game.season ?? Number(date.slice(0, 4))}
                    opponentId={teams.find((t) => t.code !== selected.team)?.id ?? ""}
                    saved={saved.some((s) => s.key === `${sport}:${selected.id}`)}
                    toggle={toggle}
                    onClose={() => setSelected(null)}
                  />
                )}
                {!players.length ? (
                  <Empty>No matching players. Pregame rosters may not be posted yet.</Empty>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="text-[10px] uppercase tracking-wider text-muted">
                        <tr>
                          <th className="py-3">Player</th>
                          <th>Team / Pos</th>
                          <th>Role</th>
                          <th className="text-right">Research</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {players.map((p) => (
                          <tr key={p.id} className={selected?.id === p.id ? "bg-pine/5" : ""}>
                            <td className="py-3 pr-3">
                              <button
                                onClick={() => setSelected(p)}
                                className="text-left text-sm font-medium hover:text-pine"
                              >
                                {p.name}
                              </button>
                            </td>
                            <td className="pr-3 text-muted">
                              {p.team} · {p.position || "—"}
                            </td>
                            <td className="text-muted">
                              {p.order
                                ? `Bats ${p.order}`
                                : p.starter
                                  ? "Starter"
                                  : "Not confirmed"}
                            </td>
                            <td className="text-right">
                              <button
                                aria-label={`Research ${p.name}`}
                                onClick={() => setSelected(p)}
                                className="rounded border border-border px-3 py-2 text-pine"
                              >
                                Open ↗
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
            {section === "Availability" && (
              <>
                <p className="text-xs text-muted">
                  Source-reported injuries with their original report dates. An empty list does not
                  establish that every player is available.
                </p>
                {!detail.injuries.length ? (
                  <Empty>No injury entries returned for this matchup.</Empty>
                ) : (
                  <div className="divide-y divide-border">
                    {detail.injuries.map((i, index) => (
                      <article key={`${i.name}-${index}`} className="py-4">
                        <div className="flex flex-wrap justify-between gap-2">
                          <h4 className="font-medium">
                            {i.name} <span className="ml-2 text-xs text-muted">{i.team}</span>
                          </h4>
                          <span className="text-xs text-amber-400">
                            {i.status || "Status not supplied"}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-muted">
                          {i.detail || "No additional detail supplied"}
                        </p>
                        <p className="mt-2 text-[11px] text-muted">Reported {time(i.date)} ET</p>
                      </article>
                    ))}
                  </div>
                )}
              </>
            )}
            {section === "Markets" && <Markets detail={detail} />}
            {section === "Team stats" && (
              <>
                <div className="rounded-lg border border-border p-4">
                  <p className="desk-eyebrow">Context</p>
                  <p className="mt-2 text-sm">Reported local weather: {detail.weather}</p>
                  <p className="mt-1 text-xs text-muted">
                    Outdoor conditions do not confirm roof status or conditions on the playing
                    surface.
                  </p>
                  {detail.series.map((s, i) => (
                    <p key={i} className="mt-2 text-sm">
                      {s}
                    </p>
                  ))}
                </div>
                <p className="text-xs text-muted">Game box-score totals, not season averages.</p>
                {detail.teamStats.length ? (
                  detail.teamStats.map((t) => (
                    <section key={t.team}>
                      <h4 className="mb-3 text-lg font-medium">{t.team}</h4>
                      <Stats stats={t.stats} />
                    </section>
                  ))
                ) : (
                  <Empty>Team box-score statistics have not been supplied yet.</Empty>
                )}
              </>
            )}
            {section === "Reports" && (
              <>
                <p className="text-xs text-muted">
                  The source’s game and league coverage. These reports may include other teams.
                </p>
                {detail.news.length ? (
                  detail.news.map((n, i) => (
                    <article key={`${n.url}-${i}`} className="border-b border-border pb-4">
                      <Source href={n.url}>{n.title}</Source>
                      <p className="mt-2 text-[11px] text-muted">{time(n.date)} ET</p>
                    </article>
                  ))
                ) : (
                  <Empty>No source reports returned.</Empty>
                )}
              </>
            )}
            <footer className="flex flex-wrap justify-between gap-2 border-t border-border pt-4">
              <Source href={detail.source}>ESPN game source</Source>
              <p className="text-[10px] text-muted">
                Retrieved {time(detail.fetchedAt)} ET · game feed cached up to 10s
              </p>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}

function Markets({ detail }: { detail: GameResearch }) {
  return (
    <>
      <p className="text-xs leading-relaxed text-muted">
        Opening, closing, and live snapshots are kept separate. “No-vig” normalizes the two implied
        moneyline probabilities; it is the market’s estimate, not an independent model edge. OFF
        means no quote.
      </p>
      {!detail.markets.length ? (
        <Empty>
          No structured moneyline quotes returned. Multi-book player prop prices are not connected.
        </Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-muted">
              <tr>
                <th className="py-3">Source / phase</th>
                <th>Away ML</th>
                <th>Home ML</th>
                <th>Away / Home no-vig</th>
                <th>Home spread</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {detail.markets.map((m, i) => (
                <tr key={i}>
                  <td className="py-4 pr-3">
                    {m.provider}
                    <span className="mt-1 block uppercase text-muted">{m.phase}</span>
                  </td>
                  <td>{m.away || "—"}</td>
                  <td>{m.home || "—"}</td>
                  <td>
                    {pct(m.awayFair)} / {pct(m.homeFair)}
                  </td>
                  <td>{m.spread || "—"}</td>
                  <td>{m.total || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Empty>
        Book quote timestamps are not supplied by this feed. The retrieval time is not a
        price-change timestamp. No stake recommendation is calculated from these prices.
      </Empty>
    </>
  );
}

function PlayerPanel({
  player,
  sport,
  date,
  opponentId,
  season,
  saved,
  toggle,
  onClose,
}: {
  player: ResearchPlayer;
  sport: ResearchSport;
  date: string;
  opponentId: string;
  season: number;
  saved: boolean;
  toggle: (p: ResearchPlayer) => void;
  onClose: () => void;
}) {
  const [window, setWindow] = useState("10");
  const [logSeason, setLogSeason] = useState(season);
  const [split, setSplit] = useState("all");
  const [metric, setMetric] = useState("");
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    panel.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [player.id]);
  const [line, setLine] = useState("");
  const log = useQuery({
    queryKey: ["research-player", sport, player.id, logSeason],
    queryFn: () => loadPlayerResearch({ data: { sport, id: player.id, season: logSeason } }),
    staleTime: 300_000,
  });
  const data = log.data;
  const labels = data?.labels ?? [];
  const selectable = labels
    .map((label, index) => ({ label, index }))
    .filter(
      ({ label }) =>
        sport !== "mlb" || !["AVG", "OBP", "SLG", "OPS", "ERA", "WHIP", "IP"].includes(label),
    );
  const defaultMetric =
    selectable.find(
      ({ label }) => label === { mlb: "HR", nfl: "Rushing Yards", nba: "PTS", nhl: "G" }[sport],
    )?.index ??
    selectable[0]?.index ??
    0;
  const metricIndex = metric === "" ? defaultMetric : Number(metric);
  const rows = useMemo(
    () => priorGameRows(data?.rows ?? [], date, split, opponentId, window),
    [data, date, split, opponentId, window],
  );
  const validLine = line.trim() !== "" && Number.isFinite(Number(line));
  const sample = sampleStats(rows, metricIndex, Number(line));
  const rate = validLine && sample.n ? sample.over / sample.n : null;
  return (
    <section
      className="rounded-xl border border-pine/40 bg-pine/[0.04] p-4 sm:p-5"
      aria-label={`${player.name} research`}
      ref={panel}
      style={{ scrollMarginTop: "20px" }}
    >
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <p className="desk-eyebrow">
            Player dossier · {player.team} / {player.position}
          </p>
          <h4 className="mt-2 text-2xl font-medium">{player.name}</h4>
          <p className="mt-1 text-xs text-muted">
            {player.order
              ? `Batting order ${player.order}`
              : player.starter
                ? "Reported starter"
                : "Starter status not confirmed"}
            {player.hand ? ` · ${player.hand}` : ""}
          </p>
        </div>
        <div className="flex items-start gap-3">
          <button
            onClick={() => toggle(player)}
            aria-pressed={saved}
            className={`${control} flex items-center gap-2`}
          >
            <Bookmark className={`size-4 ${saved ? "fill-pine text-pine" : ""}`} />
            {saved ? "Saved" : "Save player"}
          </button>
          <button aria-label="Close player research" className="p-2 text-muted" onClick={onClose}>
            ×
          </button>
        </div>
      </div>
      <h5 className="mt-6 text-sm font-medium">Historical prop explorer</h5>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        Completed game logs before {date}. Regular season and postseason are labeled in the table. A
        sample hit rate is descriptive, not a forecast; opponents, role, and minutes can change.
        Enter your own line; sportsbook prop lines are not supplied.
      </p>
      {log.isPending ? (
        <div className="mt-4">
          <Empty>Loading season game logs…</Empty>
        </div>
      ) : log.isError ? (
        <div className="mt-4" role="alert">
          <Empty>
            Player logs could not load.{" "}
            <button className="text-pine" onClick={() => void log.refetch()}>
              Retry logs
            </button>
          </Empty>
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-3">
            <label className="text-[11px] text-muted">
              Season
              <select
                aria-label="Player season"
                className={`${control} mt-1 block`}
                value={logSeason}
                onChange={(e) => {
                  setLogSeason(Number(e.target.value));
                  setMetric("");
                }}
              >
                {[season, season - 1, season - 2].map((year) => (
                  <option key={year} value={year}>
                    {sport === "nhl" || sport === "nba" ? `${year - 1}–${year}` : year}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] text-muted">
              Statistic
              <select
                aria-label="Player statistic"
                className={`${control} mt-1 block`}
                value={String(metricIndex)}
                onChange={(e) => setMetric(e.target.value)}
              >
                {selectable.map(({ label, index }) => (
                  <option key={index} value={String(index)}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] text-muted">
              Sample
              <select
                aria-label="Player sample window"
                className={`${control} mt-1 block`}
                value={window}
                onChange={(e) => setWindow(e.target.value)}
              >
                <option value="5">Last 5</option>
                <option value="10">Last 10</option>
                <option value="20">Last 20</option>
                <option value="all">Season</option>
              </select>
            </label>
            <label className="text-[11px] text-muted">
              Split
              <select
                aria-label="Player split"
                className={`${control} mt-1 block`}
                value={split}
                onChange={(e) => setSplit(e.target.value)}
              >
                <option value="all">All opponents</option>
                <option value="opponent">This opponent</option>
                <option value="home">Home</option>
                <option value="away">Away</option>
              </select>
            </label>
            <label className="text-[11px] text-muted">
              Your prop line
              <input
                aria-label="Historical prop line"
                type="number"
                step="any"
                placeholder="Enter line"
                value={line}
                onChange={(e) => setLine(e.target.value)}
                className={`${control} mt-1 block w-24`}
              />
            </label>
          </div>
          <div className="my-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-border sm:grid-cols-4">
            {[
              ["Games with values", String(sample.n)],
              ["Average", sample.average?.toFixed(2) ?? "—"],
              ["Median", sample.median?.toFixed(2) ?? "—"],
              ["Over the line", rate === null ? "—" : `${sample.over}/${sample.n} · ${pct(rate)}`],
            ].map(([label, value]) => (
              <div key={label} className="bg-surface p-3">
                <p className="text-[10px] text-muted">{label}</p>
                <p className="mt-1 font-mono text-lg">{value}</p>
              </div>
            ))}
          </div>
          {sample.n > 0 && sample.n < 5 && (
            <p className="mb-3 text-xs text-amber-400">
              Only {sample.n} games with values in this sample. This is a limited history.
            </p>
          )}
          {validLine && sample.push > 0 && (
            <p className="mb-3 text-xs text-muted">
              {sample.push} exact-line result(s), counted as pushes and not overs.
            </p>
          )}
          <SimulationLab
            key={`${logSeason}:${metricIndex}`}
            rows={rows}
            metric={metricIndex}
            label={labels[metricIndex]}
            line={line}
            selectable={selectable}
          />
          {rows.length ? (
            <>
              <div
                className="mb-4 flex h-20 items-end gap-1"
                role="img"
                aria-label={`${labels[metricIndex]} values, newest game first: ${rows.map((r) => r.stats[metricIndex] ?? "missing").join(", ")}`}
              >
                {rows.slice(0, 20).map((r) => {
                  const value = Number(r.stats[metricIndex]);
                  const max = Math.max(1, ...sample.values.map(Math.abs));
                  return (
                    <div
                      key={r.id}
                      title={`${shortDate(r.date)} ${r.opponent}: ${r.stats[metricIndex]}`}
                      className={`min-w-1 flex-1 rounded-t ${validLine && value > Number(line) ? "bg-pine" : "bg-muted/35"}`}
                      style={{
                        height: `${Number.isFinite(value) ? Math.max(3, (Math.abs(value) / max) * 100) : 3}%`,
                      }}
                    />
                  );
                })}
              </div>
              <div className="max-h-72 overflow-auto">
                <table className="w-full whitespace-nowrap text-left text-xs">
                  <caption className="sr-only">
                    {player.name} game logs before the selected research date
                  </caption>
                  <thead className="sticky top-0 bg-surface text-muted">
                    <tr>
                      <th className="p-2">Date</th>
                      <th className="p-2">Opponent / season</th>
                      <th className="p-2">Result</th>
                      {labels.map((l, i) => (
                        <th
                          className={`p-2 ${i === metricIndex ? "text-pine" : ""}`}
                          key={`${l}-${i}`}
                        >
                          {l}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td className="p-2">{shortDate(r.date)}</td>
                        <td className="p-2">
                          {r.location} {r.opponent}
                          <span className="block text-[10px] text-muted">{r.seasonType}</span>
                        </td>
                        <td className="p-2">{r.result}</td>
                        {labels.map((_, i) => (
                          <td
                            className={`p-2 font-mono ${i === metricIndex ? "text-pine" : ""}`}
                            key={i}
                          >
                            {r.stats[i] ?? "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <Empty>
              No prior games match this date and split. A missing sample is not a zero hit rate.
            </Empty>
          )}
          {data && (
            <div className="mt-4">
              <Source href={data.source}>Verify player logs at ESPN</Source>
            </div>
          )}
        </>
      )}
      {sport === "mlb" && (
        <p className="mt-3 text-[11px] text-muted">
          Rate columns such as AVG and OPS may be cumulative in the source log; they are excluded
          from the prop calculator. Innings pitched is also excluded because baseball uses outs, not
          decimal innings.
        </p>
      )}
      <details className="mt-5 border-t border-pine/20 pt-4">
        <summary className="cursor-pointer text-xs text-muted">
          Current game box-score detail · {player.stats.length} fields
        </summary>
        <div className="mt-3">
          {player.stats.length ? (
            <Stats stats={player.stats} />
          ) : (
            <Empty>No game statistics supplied yet.</Empty>
          )}
        </div>
      </details>
    </section>
  );
}
