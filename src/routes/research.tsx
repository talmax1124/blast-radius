import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowUpRight, RefreshCw, Search } from "lucide-react";
import { Nameplate } from "@/components/desk/edition";
import { Button } from "@/components/ui/button";
import { loadResearch } from "@/lib/research/functions";
import type { League } from "@/lib/research/types";

export const Route = createFileRoute("/research")({ component: ResearchDesk });

function stamp(value: string) {
  return new Date(value).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ResearchDesk() {
  const [league, setLeague] = useState<League | "all">("all");
  const [search, setSearch] = useState("");
  const [topic, setTopic] = useState("all");
  const query = useQuery({
    queryKey: ["research-desk"],
    queryFn: () => loadResearch(),
    staleTime: 60_000,
    refetchInterval: 300_000,
  });
  const data = query.data;
  const report = data?.report;
  const articles = useMemo(
    () =>
      (report?.articles ?? []).filter(
        (item) =>
          (league === "all" || item.league === league) &&
          (topic === "all" || item.topic === topic) &&
          `${item.title} ${item.summary}`.toLowerCase().includes(search.trim().toLowerCase()),
      ),
    [report, league, topic, search],
  );
  const runs = data?.history.filter((run) => run.date === data.date) ?? [];
  const published = runs.filter((run) => run.status === "published").length;
  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-7 px-4 py-5 pb-20 sm:px-6 lg:px-8">
      <Nameplate sport="research" />
      <section className="desk-hero">
        <div>
          <span className="desk-eyebrow">Research / The morning edition</span>
          <h1>
            More context.
            <br />
            <span className="text-pine">A clearer read.</span>
          </h1>
          <p>
            Follow the reports behind the slate. News, availability signals, and roster moves—with
            the source and timestamp always in view.
          </p>
        </div>
        <Button
          variant="secondary"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          <RefreshCw className={query.isFetching ? "animate-spin" : ""} />
          {query.isFetching
            ? "Checking sources…"
            : data?.published
              ? "Reload edition"
              : "Check for updates"}
        </Button>
      </section>
      <section className="desk-metrics" aria-label="Research coverage">
        <div className="desk-metric">
          <span>Recent reports</span>
          <strong>{report?.articles.length ?? "—"}</strong>
          <span>Last 72 hours</span>
        </div>
        <div className="desk-metric">
          <span>Feeds responding</span>
          <strong>
            {report
              ? `${report.feeds.filter((f) => f.status !== "error").length}/${report.feeds.length}`
              : "—"}
          </strong>
          <span>MLB · NFL · NHL</span>
        </div>
        <div className="desk-metric">
          <span>Morning publication</span>
          <strong>{published}/5</strong>
          <span>Tasks saved today</span>
        </div>
        <div className="desk-metric">
          <span>Daily target</span>
          <strong>
            8:00 <span>AM ET</span>
          </strong>
          <span>
            {data?.scheduleReady
              ? "Server configured · see run history"
              : "Deployment setup required"}
          </span>
        </div>
      </section>
      {query.isError ? (
        <div role="alert" className="panel p-5">
          <h2 className="font-medium">Research could not load</h2>
          <p className="mt-2 text-sm text-muted">
            The source or storage connection is unavailable. Check for updates to retry.
          </p>
        </div>
      ) : null}
      {query.isPending ? (
        <div role="status" className="panel p-8 text-muted">
          Collecting reports and checking publication history…
        </div>
      ) : null}
      {report ? (
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0">
            {report.synthesis.length ? (
              <section className="mb-7 rounded-xl border border-pine/30 bg-pine/5 p-5">
                <p className="desk-eyebrow">AI research brief · {report.model}</p>
                <h2 className="font-display mt-3 text-3xl">What deserves a closer look</h2>
                <ol className="mt-4 space-y-4">
                  {report.synthesis.map((insight, index) => (
                    <li key={index}>
                      <p className="text-sm leading-relaxed">{insight.text}</p>
                      <div className="mt-2 flex flex-wrap gap-3">
                        {insight.sourceIds.map((id) => {
                          const source = report.articles.find((a) => a.id === id);
                          return source ? (
                            <a
                              className="text-xs text-pine hover:underline"
                              key={id}
                              href={source.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {source.league.toUpperCase()} · {source.source} ↗
                            </a>
                          ) : null;
                        })}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-medium tracking-tight">The research wire</h2>
              <span className="text-xs text-muted">
                {data?.published ? "Morning snapshot" : "Live preview"} ·{" "}
                {stamp(report.generatedAt)} ET
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted">{report.note}</p>
            <div
              className="mt-5 flex flex-wrap gap-2"
              role="group"
              aria-label="Filter reports by league"
            >
              {(["all", "mlb", "nfl", "nhl"] as const).map((value) => (
                <button
                  key={value}
                  aria-pressed={league === value}
                  onClick={() => setLeague(value)}
                  className={`rounded-md px-4 py-2 text-xs font-medium ${league === value ? "bg-pine text-ink" : "bg-surface text-muted hover:text-fg"}`}
                >
                  {value === "all" ? "All sports" : value.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <label className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-surface px-3">
                <Search className="size-4 text-muted" />
                <input
                  type="search"
                  aria-label="Search reports"
                  placeholder="Search players, teams, or topics"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-11 min-w-0 flex-1 bg-transparent text-sm"
                />
              </label>
              <select
                aria-label="Report topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="h-11 rounded-md border border-border bg-surface px-3 text-sm"
              >
                <option value="all">All reports</option>
                <option value="availability">Availability signals</option>
                <option value="roster">Roster moves</option>
                <option value="report">General reports</option>
              </select>
            </div>
            <div className="mt-5 divide-y divide-border">
              {articles.map((item) => (
                <article key={item.id} className="group py-6 first:pt-2">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
                    <span className="font-mono text-pine">{item.league.toUpperCase()}</span>
                    <span>·</span>
                    <span>
                      {item.topic === "availability"
                        ? "Availability signal"
                        : item.topic === "roster"
                          ? "Roster move"
                          : "Report"}
                    </span>
                    <span className="ml-auto">{stamp(item.publishedAt)} ET</span>
                  </div>
                  <h3 className="mt-2 text-lg font-medium leading-snug tracking-tight">
                    <a href={item.url} target="_blank" rel="noreferrer" className="hover:text-pine">
                      {item.title}
                      <ArrowUpRight className="ml-1 inline size-4 text-muted" />
                    </a>
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{item.summary}</p>
                  <p className="mt-3 text-[11px] text-faint">
                    Reported by {item.source} ·{" "}
                    {item.topic === "availability"
                      ? "Verify the official status before using in a projection"
                      : "Source report"}
                  </p>
                </article>
              ))}
            </div>
            {!articles.length ? (
              <div className="panel mt-5 p-8">
                <h3 className="font-medium">No reports match this view</h3>
                <p className="mt-2 text-sm text-muted">
                  Try another sport, clear your search, or check the source status.
                </p>
              </div>
            ) : null}
          </div>
          <aside className="flex flex-col gap-5">
            <section className="panel p-5">
              <p className="desk-eyebrow">The daily routine</p>
              <h2 className="mt-3 text-lg font-medium">Ready before the slate.</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                The morning job saves MLB, NFL, NHL, combined board, and research editions. Each
                task has its own result, so failures can be retried without republishing completed
                work.
              </p>
              <div className="my-4 h-px bg-border" />
              <p className="text-xs leading-relaxed text-muted">
                {data?.scheduleReady
                  ? "Server credentials and persistent storage are configured. A published run below confirms execution."
                  : "Background publication needs to be activated on your hosting service. No scheduled run has been verified in this environment."}
              </p>
              <p className="mt-3 text-xs text-muted">
                {data?.modelConfigured
                  ? "AI synthesis is configured."
                  : "Source digest mode. AI synthesis has not been connected."}
              </p>
            </section>
            <section className="panel p-5">
              <h2 className="text-sm font-medium">Source health</h2>
              <ul className="mt-4 space-y-4">
                {report.feeds.map((feed) => (
                  <li key={feed.league}>
                    <div className="flex justify-between gap-3 text-xs">
                      <span>{feed.name}</span>
                      <span className={feed.status === "error" ? "text-brick" : "text-pine"}>
                        {feed.status === "error"
                          ? "Unavailable"
                          : feed.status === "empty"
                            ? "No recent reports"
                            : `${feed.count} reports`}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted">{feed.message}</p>
                  </li>
                ))}
              </ul>
            </section>
            <section className="panel p-5">
              <h2 className="text-sm font-medium">Publication history</h2>
              {data?.history.length ? (
                <ul className="mt-4 space-y-4">
                  {data.history.slice(0, 12).map((run) => (
                    <li key={`${run.date}:${run.task}`}>
                      <div className="flex justify-between gap-2 text-xs">
                        <span className="uppercase">{run.task}</span>
                        <span
                          className={
                            run.status === "failed"
                              ? "text-brick"
                              : run.status === "published"
                                ? "text-pine"
                                : "text-muted"
                          }
                        >
                          {run.status}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-muted">
                        {run.date}
                        {run.finished_at ? ` · ${stamp(run.finished_at)} ET` : ""}
                      </p>
                      {run.error ? <p className="mt-1 text-xs text-brick">{run.error}</p> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-xs leading-relaxed text-muted">
                  No scheduled editions have been saved yet.
                </p>
              )}
            </section>
            <p className="text-xs leading-relaxed text-muted">
              Research coverage: ESPN news across three sports, alongside the existing statistical,
              lineup, weather, and market feeds on each sport desk. Coverage is not exhaustive;
              unavailable sources are shown explicitly.
            </p>
          </aside>
        </div>
      ) : null}
    </main>
  );
}
