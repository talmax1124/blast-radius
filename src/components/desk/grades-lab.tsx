import { ClipboardList } from "lucide-react";
import { RecapSpread, SectionFlag } from "@/components/desk/edition";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { editionCopy, latestFinal } from "@/lib/mlb/copy";
import {
  altCopy,
  breakEvenCover,
  dragCopy,
  formatCoverPct,
  formatEv,
  formatKelly,
  sizeLabel,
  sizeVariant,
  slipEv,
} from "@/lib/mlb/ev";
import {
  formatUnits,
  isSmash,
  ledgerReport,
  payoutLabel,
  payoutVariant,
  reportOf,
  slipPayout,
  unitsTone,
} from "@/lib/mlb/grade";
import { GRADE_GLOSSARY } from "@/lib/mlb/glossary";
import { NOTION_CARDS_URL, NOTION_LEGS_URL, NOTION_PHONE_URL } from "@/lib/mlb/notion";
import { formatDeskDate, headshotUrl, todayEt } from "@/lib/mlb/parse";
import { isSkipDay, HR_LOOKBACK, type DeskLogEntry } from "@/lib/mlb/recap";
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
  const smash = isSmash(leg) ? " smash" : "";
  return `${side} ${leg.line} ${MARKET_SHORT[leg.market]}${leg.oddsType !== "standard" ? ` · ${leg.oddsType}` : ""}${leg.actual != null ? ` · ${leg.actual}${smash}` : ""}`;
}

function statusCopy(entry: DeskLogEntry): string {
  const legs = entry.slips.flatMap((s) => s.legs);
  const open = legs.filter((l) => !l.result || l.result === "pending").length;
  if (!legs.length) return isSkipDay(entry) ? "Skip" : entry.slate?.length ? "No card" : "Empty";
  if (open === 0 && entry.grade) return "Final";
  if (open < legs.length) return "Live";
  return "Open";
}

function unitsClass(units: number | null): string {
  const tone = unitsTone(units);
  if (tone === "pine") return "text-pine";
  if (tone === "brick") return "text-brick";
  return "text-muted";
}

function slipHeadline(slip: SlipCard): { hits: number; n: number; open: number; label: string } {
  const payout = slipPayout(slip);
  const n = payout.hits + payout.misses;
  return { hits: payout.hits, n, open: payout.open, label: payoutLabel(payout) };
}

function bookCorrelated(log: DeskLogEntry[]): { units: number; n: number } {
  let units = 0;
  let n = 0;
  for (const entry of log) {
    for (const slip of entry.slips) {
      const pay = slipPayout(slip);
      if (pay.status === "open" || pay.status === "void") continue;
      if (slip.skip || !slip.legs.length) continue;
      units += slipEv(slip).correlated - 1;
      n += 1;
    }
  }
  return { units, n };
}

export function GradesLab({
  log,
  grading = false,
  date,
  games = 0,
}: {
  log: DeskLogEntry[];
  grading?: boolean;
  date?: string;
  games?: number;
}) {
  const report = ledgerReport(log);
  const pct = report.n > 0 ? Math.round((report.hits / report.n) * 100) : null;
  const luck = report.n > 0 ? report.hits - report.expectedHits : null;
  const priced = bookCorrelated(log);
  const editionDate = date ?? log[0]?.date ?? todayEt();
  const copy = editionCopy({ date: editionDate, log, games });
  const recap = latestFinal(log);

  if (!log.length) {
    return (
      <div className="flex flex-col gap-6">
        <SectionFlag>Last ten boards</SectionFlag>
        <HrLookback />
        <Card className="px-5 py-10 text-center text-sm text-muted">
          Fetch a card to start the ledger. The night desk posts and grades on its own. Skip days are not losses.
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <RecapSpread copy={copy} entry={recap} />

      <SectionFlag>Last ten boards</SectionFlag>
      <HrLookback />

      <SectionFlag>The book</SectionFlag>

      <div className="overflow-hidden border border-border">
        <div className="grid sm:grid-cols-2">
          <div className="bg-paper px-5 py-5 text-ink">
            <p className="kicker text-ink/50">
              Ledger{grading ? " · scoring boxes" : ""} · last 7 days
            </p>
            <p className="font-display mt-2 text-6xl leading-none font-extrabold tabular-nums">
              {report.n > 0 ? `${report.hits}/${report.n}` : "—"}
            </p>
            <p className="mt-2 text-sm text-ink/60">
              {pct != null ? `${pct}% cleared` : "Waiting on a Final card"}
              {report.dnp ? ` · ${report.dnp} DNP` : ""}
            </p>
          </div>
          <div className="bg-surface px-5 py-5">
            <p className="kicker">Units</p>
            <p className={`font-display mt-2 text-6xl leading-none font-extrabold tabular-nums ${unitsClass(report.units)}`}>
              {report.units != null ? formatUnits(report.units) : "—"}
            </p>
            <p className="mt-2 text-sm text-muted">
              {report.staked ? `${report.staked} slip${report.staked === 1 ? "" : "s"} staked` : "No settled slips"}
              {report.cashed || report.lost || report.flexed
                ? ` · ${[report.cashed && `${report.cashed} cashed`, report.lost && `${report.lost} lost`, report.flexed && `${report.flexed} flex`].filter(Boolean).join(" · ")}`
                : ""}
            </p>
            <p className="mt-3 text-xs text-muted">
              Phone book (Notion, survives a restart):{" "}
              <a className="underline underline-offset-2" href={NOTION_CARDS_URL} target="_blank" rel="noreferrer">
                Cards
              </a>
              {" · "}
              <a className="underline underline-offset-2" href={NOTION_LEGS_URL} target="_blank" rel="noreferrer">
                Legs
              </a>
              {" · "}
              <a className="underline underline-offset-2" href={NOTION_PHONE_URL} target="_blank" rel="noreferrer">
                Recap
              </a>
            </p>
          </div>
        </div>
        {report.n > 0 ? (
          <p className="border-t border-border bg-surface px-5 py-3 text-sm leading-relaxed text-muted">
            {report.expectedHits > 0
              ? `Model expected ${report.expectedHits.toFixed(1)} hits${luck != null ? ` · luck ${luck >= 0 ? "+" : "−"}${Math.abs(luck).toFixed(1)}` : ""}.`
              : null}{" "}
            {report.brier != null ? `Brier ${report.brier.toFixed(3)}` : ""}
            {report.logLoss != null ? ` · log-loss ${report.logLoss.toFixed(2)}` : ""}
            {report.expectedUnits != null ? ` · independent EV ${formatUnits(report.expectedUnits)}` : ""}
            {priced.n ? ` · correlated EV ${formatUnits(priced.units)}` : ""}.
          </p>
        ) : (
          <p className="border-t border-border bg-surface px-5 py-3 text-sm leading-relaxed text-muted">
            Saturday 9/12 is the only graded card in this book (+2.0u). Empty days are skips, not losses. Tonight stays Open until boxes go Final.
          </p>
        )}
      </div>

      {report.byMarket.length ? (
        <section className="panel px-5 py-4">
          <p className="kicker">Market leak</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {report.byMarket.map((row) => (
              <li key={row.market} className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium">{MARKET_SHORT[row.market]}</span>
                <span className="text-sm text-muted tabular-nums">
                  {row.n ? `${row.hits}/${row.n}` : "—"}
                  {row.expected ? ` · exp ${row.expected.toFixed(1)}` : ""}
                  {row.brier != null ? ` · Brier ${row.brier.toFixed(2)}` : ""}
                  {row.dnp ? ` · ${row.dnp} DNP` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="panel px-5 py-4">
        <p className="kicker">Expected value</p>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          Multiplier the PrizePicks chart owes the cover vector. Independent first, then a same-game copula. Power 2 needs 57.7% each. Flex 6 needs 54.2% — the 25x tail is why 55% counting belongs there, not on a 3x pair.
        </p>
        <ul className="mt-4 grid gap-px bg-border sm:grid-cols-3">
          {[
            { label: "Power 2", kind: "power" as const, n: 2 },
            { label: "Power 3", kind: "power" as const, n: 3 },
            { label: "Flex 6", kind: "flex" as const, n: 6 },
          ].map((row) => (
            <li key={row.label} className="bg-elevated px-4 py-4">
              <p className="kicker">{row.label}</p>
              <p className="font-display mt-1 text-4xl font-extrabold tabular-nums">{formatCoverPct(breakEvenCover(row.kind, row.n))}</p>
              <p className="mt-1 text-xs text-muted">break-even cover</p>
            </li>
          ))}
        </ul>
      </section>

      <SectionFlag>The file</SectionFlag>

      <ol className="enter-stagger flex flex-col gap-4">
        {log.map((entry) => {
          const status = statusCopy(entry);
          const day = reportOf(entry.slips);
          return (
            <li key={entry.date} className="panel p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="kicker">
                    {entry.version ? `Model ${entry.version} · ` : ""}
                    {status}
                    {entry.slate?.length ? ` · ${entry.slate.length} games` : ""}
                  </p>
                  <h3 className="font-display mt-1 text-2xl font-semibold tracking-tight">{formatDeskDate(entry.date)}</h3>
                </div>
                <div className="text-right">
                  <p className="font-display text-4xl leading-none font-semibold tabular-nums">
                    {day.n + day.dnp > 0 ? `${day.hits}/${day.n}` : "—"}
                  </p>
                  {day.units != null ? (
                    <p className={`mt-1 text-sm font-medium tabular-nums ${unitsClass(day.units)}`}>{formatUnits(day.units)}</p>
                  ) : null}
                </div>
              </div>
              {entry.grade?.summary ? <p className="mt-2 text-sm leading-relaxed text-muted">{entry.grade.summary}</p> : null}
              {day.slips.length ? (
                <p className="mt-2 text-xs tracking-wide text-faint uppercase">
                  {day.slips.map((p) => payoutLabel(p)).join(" · ")}
                </p>
              ) : null}
              {!entry.slips.length && !entry.grade?.summary ? (
                <p className="mt-2 text-sm text-muted">No card published this day. A skip is not a loss.</p>
              ) : null}
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

              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                {entry.slips.map((slip) => {
                  const tally = slipHeadline(slip);
                  const payout = slipPayout(slip);
                  const ev = slipEv(slip);
                  const drag = dragCopy(ev);
                  const alt = altCopy(ev);
                  const stack = ev.stacks[0];
                  return (
                    <article key={`${entry.date}-${slip.size}`} className="bg-elevated px-3 py-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-xs tracking-widest text-faint uppercase">{slip.title}</p>
                        <div className="flex items-center gap-2">
                          <Badge variant={payoutVariant(payout.status)}>{tally.label}</Badge>
                          <p className="font-display text-lg font-semibold tabular-nums">
                            {tally.n + tally.open === 0 ? "—" : tally.open && !tally.n ? "Open" : `${tally.hits}/${tally.n || slip.legs.length}`}
                          </p>
                        </div>
                      </div>
                      {payout.expectedMultiplier ? (
                        <p className="mt-1 text-xs text-faint tabular-nums">
                          EV {formatEv(ev.correlated)}
                          {Math.abs(ev.correlated - ev.independent) >= 0.03 ? ` · ind ${formatEv(ev.independent)}` : ""}
                          {payout.units != null ? ` · ${formatUnits(payout.units)}` : ""}
                        </p>
                      ) : null}
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                        <Badge variant={sizeVariant(ev.size)}>{sizeLabel(ev.size)}</Badge>
                        <span className="tabular-nums">
                          need {formatCoverPct(ev.breakEven)}
                          {ev.quarterKelly > 0 ? ` · 1/4 Kelly ${formatKelly(ev.quarterKelly)} BR` : ""}
                          {stack ? ` · ${stack.n} ${stack.team}` : ""}
                        </span>
                      </div>
                      {drag ? <p className="mt-1 text-xs text-brick">{drag}</p> : null}
                      {alt ? <p className="mt-1 text-xs text-muted">{alt}</p> : null}
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
                                <span className="block truncate text-xs text-muted">{lineCopy(leg)}</span>
                              </span>
                              <Badge variant={isSmash(leg) ? "smash" : badge.variant}>{isSmash(leg) ? "Smash" : badge.label}</Badge>
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

      <section className="panel p-5">
        <div className="flex items-center gap-2">
          <ClipboardList className="size-3.5 text-stone" />
          <p className="kicker">Grade glossary</p>
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

function HrLookback() {
  const hits = HR_LOOKBACK.reduce((s, r) => s + r.hits, 0);
  const n = HR_LOOKBACK.reduce((s, r) => s + r.n, 0);
  const rand = HR_LOOKBACK.reduce((s, r) => s + r.random, 0);
  return (
    <div className="overflow-hidden border border-border">
      <div className="grid grid-cols-2 bg-paper text-ink">
        <div className="px-5 py-4">
          <p className="text-[0.65rem] font-medium tracking-widest uppercase text-ink/50">Sept 8–19 board</p>
          <p className="font-display mt-1 text-4xl leading-none font-extrabold tabular-nums">
            {hits}/{n}
          </p>
        </div>
        <div className="border-l border-ink/10 px-5 py-4">
          <p className="text-[0.65rem] font-medium tracking-widest uppercase text-ink/50">vs random 12</p>
          <p className="font-display mt-1 text-4xl leading-none font-extrabold tabular-nums">{rand.toFixed(1)}</p>
        </div>
      </div>
      <p className="border-t border-ink/10 bg-paper px-5 py-3 text-sm text-ink/60">
        Season-rate through Sept 17, live 3.1 on Sept 18, live 3.3 on Sept 19. A 22% board is 2–3 of 12 — that is the sport, not a broken model.
      </p>
      <ol className="divide-y divide-border bg-surface">
        {HR_LOOKBACK.map((row) => (
          <li key={row.date} className="flex items-baseline justify-between gap-3 px-5 py-2.5">
            <span className="text-sm tabular-nums">{row.date.slice(5)}</span>
            <span className="min-w-0 flex-1 text-xs text-muted">
              {row.slateHr} HR slate · expected {row.expected.toFixed(1)}
            </span>
            <span className="font-display text-lg font-semibold tabular-nums">
              {row.hits}/{row.n}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
