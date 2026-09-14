import { ClipboardList } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { GRADE_GLOSSARY } from "@/lib/mlb/glossary";
import { formatDeskDate, headshotUrl } from "@/lib/mlb/parse";
import { ledgerRate, type DeskLogEntry } from "@/lib/mlb/recap";
import type { LegResult, PropMarket, SlipCard, SlipLeg } from "@/lib/mlb/types";

const MARKET_SHORT: Record<PropMarket, string> = {
  hr: "HR",
  hits: "H",
  tb: "TB",
  rbi: "RBI",
  sb: "SB",
  k: "Ks",
  hrrbi: "H+R+RBI",
  runs: "R",
  fs: "FS",
};

function resultBadge(result: LegResult | undefined): { label: string; variant: "pine" | "brick" | "default" } {
  if (result === "hit") return { label: "Hit", variant: "pine" };
  if (result === "miss") return { label: "Miss", variant: "brick" };
  if (result === "dnp") return { label: "DNP", variant: "default" };
  return { label: "Open", variant: "default" };
}

function lineCopy(leg: SlipLeg): string {
  const side = leg.side === "over" ? "O" : "U";
  return `${side} ${leg.line} ${MARKET_SHORT[leg.market]}`;
}

function slipTally(slip: SlipCard): { hits: number; n: number; open: number } {
  const hits = slip.legs.filter((l) => l.result === "hit").length;
  const n = slip.legs.filter((l) => l.result === "hit" || l.result === "miss").length;
  const open = slip.legs.filter((l) => !l.result || l.result === "pending").length;
  return { hits, n, open };
}

function statusCopy(entry: DeskLogEntry): string {
  const legs = entry.slips.flatMap((s) => s.legs);
  const open = legs.filter((l) => !l.result || l.result === "pending").length;
  if (!legs.length) return entry.slate?.length ? "No card" : "Empty";
  if (open === 0 && entry.grade) return "Final";
  if (open < legs.length) return "Live";
  return "Open";
}

export function GradesLab({
  log,
  grading = false,
}: {
  log: DeskLogEntry[];
  grading?: boolean;
}) {
  const rate = ledgerRate(log);
  const pct = rate.n > 0 ? Math.round((rate.hits / rate.n) * 100) : null;

  if (!log.length) {
    return (
      <Card className="rounded-xl px-5 py-10 text-center text-sm text-muted">
        Fetch a card to start the ledger. Boxes grade automatically after first pitch — PrizePicks is not required.
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="font-display text-3xl font-semibold tracking-tight">Daily grades</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Shared 7-day book. Slips score from MLB boxes after first pitch — PrizePicks is not required. Days without a published card still show the slate.
        </p>
      </div>

      <div className="rounded-xl bg-surface px-5 py-4 shadow-[var(--shadow-border)]">
        <p className="text-xs tracking-widest text-stone uppercase">
          Ledger{grading ? " · scoring boxes" : ""} · last 7 days
        </p>
        <div className="mt-2 flex flex-wrap items-end gap-6">
          <div>
            <p className="font-display text-5xl leading-none font-semibold tabular-nums">
              {rate.n > 0 ? `${rate.hits}/${rate.n}` : "—"}
            </p>
            <p className="mt-1 text-sm text-muted">
              {pct != null ? `${pct}% cleared` : "Waiting on a Final card"}
              {rate.dnp ? ` · ${rate.dnp} DNP` : ""}
            </p>
          </div>
          <p className="max-w-md text-sm leading-relaxed text-muted">
            {rate.cards} graded card{rate.cards === 1 ? "" : "s"} in the window. Saturday 9/12 is seeded at 9/11.
          </p>
        </div>
      </div>

      <ol className="enter-stagger flex flex-col gap-4">
        {log.map((entry) => {
          const status = statusCopy(entry);
          return (
            <li key={entry.date} className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)] sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs tracking-widest text-stone uppercase">
                    {entry.version ? `Model ${entry.version} · ` : ""}
                    {status}
                    {entry.slate?.length ? ` · ${entry.slate.length} games` : ""}
                  </p>
                  <h3 className="font-display mt-1 text-2xl font-semibold tracking-tight">{formatDeskDate(entry.date)}</h3>
                </div>
                <p className="font-display text-4xl leading-none font-semibold tabular-nums">
                  {entry.grade && entry.grade.n + entry.grade.dnp > 0 ? `${entry.grade.hits}/${entry.grade.n}` : "—"}
                </p>
              </div>
              {entry.grade?.summary ? <p className="mt-2 text-sm leading-relaxed text-muted">{entry.grade.summary}</p> : null}
              {!entry.slips.length && entry.slate?.length ? (
                <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                  {entry.slate.map((g) => (
                    <li key={`${entry.date}-${g.away}-${g.home}`} className="text-xs text-muted tabular-nums">
                      {g.away}
                      {g.awayScore != null ? ` ${g.awayScore}` : ""} @ {g.home}
                      {g.homeScore != null ? ` ${g.homeScore}` : ""} · {g.state}
                    </li>
                  ))}
                </ul>
              ) : null}
              {!entry.slips.length && !entry.slate?.length ? (
                <p className="mt-2 text-sm text-muted">No card published this day.</p>
              ) : null}

              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                {entry.slips.map((slip) => {
                  const tally = slipTally(slip);
                  return (
                    <article key={`${entry.date}-${slip.size}`} className="rounded-lg bg-elevated px-3 py-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-xs tracking-widest text-faint uppercase">{slip.title}</p>
                        <p className="font-display text-lg font-semibold tabular-nums">
                          {tally.n + tally.open === 0 ? "—" : tally.open && !tally.n ? "Open" : `${tally.hits}/${tally.n || slip.legs.length}`}
                        </p>
                      </div>
                      <ul className="mt-2 flex flex-col gap-1.5">
                        {slip.legs.map((leg, i) => {
                          const badge = resultBadge(leg.result);
                          return (
                            <li key={`${slip.size}-${leg.playerId}-${leg.market}-${i}`} className="flex items-center gap-2">
                              <img
                                src={headshotUrl(leg.playerId)}
                                alt=""
                                className="size-7 shrink-0 rounded-sm bg-bg object-cover outline outline-1 -outline-offset-1 outline-fg/10"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-xs font-medium">{leg.name}</span>
                                <span className="block truncate text-xs text-muted">
                                  {lineCopy(leg)}
                                  {leg.oddsType !== "standard" ? ` · ${leg.oddsType}` : ""}
                                  {leg.actual != null ? ` · ${leg.actual}` : ""}
                                </span>
                              </span>
                              <Badge variant={badge.variant}>{badge.label}</Badge>
                            </li>
                          );
                        })}
                      </ul>
                    </article>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ol>

      <section className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]">
        <div className="flex items-center gap-2 text-xs tracking-widest text-stone uppercase">
          <ClipboardList className="size-3.5" />
          Grade glossary
        </div>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {GRADE_GLOSSARY.map((term) => (
            <li key={term.key}>
              <p className="text-xs font-medium tracking-wide uppercase">{term.label}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">{term.blurb}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
