import { Layers } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { altCopy, dragCopy, formatCoverPct, formatEv, formatKelly, sizeLabel, sizeVariant, slipEv } from "@/lib/mlb/ev";
import { formatMult, formatUnits, isSmash, payoutLabel, payoutVariant, reportOf, slipPayout, unitsTone } from "@/lib/mlb/grade";
import { SLIP_GLOSSARY } from "@/lib/mlb/glossary";
import { headshotUrl } from "@/lib/mlb/parse";
import { CHALK_SCORE } from "@/lib/mlb/types";
import type { AnalysisResult, Lean, LegResult, PropMarket, SlipCard, SlipLeg } from "@/lib/mlb/types";

const MARKET_LABEL: Record<PropMarket, string> = {
  hr: "Home Runs",
  hits: "Hits",
  tb: "Total Bases",
  rbi: "RBIs",
  sb: "Stolen Bases",
  k: "Pitcher Strikeouts",
  hrrbi: "Hits+Runs+RBIs",
  runs: "Runs",
  fs: "Fantasy Score",
};

const CARD_TONE: Record<2 | 3 | 6, { bar: string; kicker: string }> = {
  2: { bar: "bg-brick", kicker: "Chalk lane" },
  3: { bar: "bg-pine", kicker: "Disjoint core" },
  6: { bar: "bg-stone", kicker: "Uncorrelated flex" },
};

function leanVariant(lean: Lean): "smash" | "strong" | "lean" | "spec" {
  return lean;
}

function lineCopy(leg: SlipLeg): string {
  const side = leg.side === "over" ? "Over" : "Under";
  const stat = leg.stat || MARKET_LABEL[leg.market];
  return `${side} ${leg.line} ${stat}`;
}

function resultBadge(result: LegResult | undefined): { label: string; variant: "pine" | "brick" | "default" | "smash" } | null {
  if (result === "hit") return { label: "Hit", variant: "pine" };
  if (result === "miss") return { label: "Miss", variant: "brick" };
  if (result === "dnp") return { label: "DNP", variant: "default" };
  return null;
}

function unitsClass(units: number | null): string {
  const tone = unitsTone(units);
  if (tone === "pine") return "text-pine";
  if (tone === "brick") return "text-brick";
  return "";
}

function GradedBanner({
  slips,
  fallback,
}: {
  slips: SlipCard[];
  fallback: NonNullable<AnalysisResult["grade"]>;
}) {
  const report = reportOf(slips);
  const hits = report.n > 0 ? report.hits : fallback.hits;
  const n = report.n > 0 ? report.n : fallback.n;
  return (
    <div>
    <div className="grid grid-cols-2 overflow-hidden bg-paper text-ink">
      <div className="px-5 py-4">
        <p className="text-[0.65rem] font-medium tracking-widest uppercase text-ink/50">Graded card</p>
        <p className="font-display mt-1 text-4xl leading-none font-extrabold tabular-nums">
          {hits}/{n}
        </p>
      </div>
      {report.units != null ? (
        <div className="border-l border-ink/10 px-5 py-4">
          <p className="text-[0.65rem] font-medium tracking-widest uppercase text-ink/50">Units</p>
          <p className={`font-display mt-1 text-4xl leading-none font-extrabold tabular-nums ${report.units > 0 ? "text-pine" : report.units < 0 ? "text-brick" : ""}`}>
            {formatUnits(report.units)}
          </p>
        </div>
      ) : null}
    </div>
    <p className="panel rounded-t-none px-5 py-3 text-sm text-muted">
      {report.slips.map((p) => payoutLabel(p)).join(" · ") || fallback.summary}
    </p>
    </div>
  );
}

export function SlipsLab({
  slips,
  lineCount,
  grade,
  log = [],
  onOpen,
}: {
  slips: SlipCard[];
  lineCount: number;
  grade: AnalysisResult["grade"];
  log?: Array<{ date: string; version: string; slips: SlipCard[]; grade: AnalysisResult["grade"] }>;
  onOpen: (playerId: number, market: PropMarket) => void;
}) {
  if (!slips.length) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <p className="kicker">The card</p>
          <h2 className="font-display mt-1 text-4xl font-semibold tracking-tight">Daily slips</h2>
        </div>
        <Card className="px-5 py-10 text-center text-sm text-muted">
          No slip cleared the 3.1 floor. A skip is not a loss. Power 2 needs a K or 0.5 contact pair over 1.02x. The Great Run board still ranks tonight’s home runs.
        </Card>
        <EmptySlots posted={[]} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="kicker">The card</p>
        <h2 className="font-display mt-1 text-4xl font-semibold tracking-tight">Daily slips</h2>
        <p className="font-serif mt-1 max-w-2xl text-sm leading-relaxed text-muted italic">
          Built to maximize PrizePicks expected multiplier, not raw cover. Power 2 enumerates pairs. Flex penalizes same-game stacks. Names under {CHALK_SCORE} never repeat.
          {lineCount ? " PrizePicks board is live." : ""}
        </p>
      </div>

      {grade && grade.n + grade.dnp > 0 ? (
        <GradedBanner slips={slips} fallback={grade} />
      ) : (
        <p className="text-sm text-muted">
          Card is open. Grades post from MLB boxes once games go Final — no need to re-fetch PrizePicks.
        </p>
      )}

      <div className="enter-stagger grid min-w-0 gap-4 lg:grid-cols-3">
        {slips.map((slip) => {
          if (slip.skip || slip.legs.length < slip.size) {
            return <SkipSlot key={`skip-${slip.size}`} size={slip.size} note={slip.notes} />;
          }
          const tone = CARD_TONE[slip.size];
          const payout = slipPayout(slip);
          const ev = slipEv(slip);
          const settled = payout.status !== "open";
          const drag = dragCopy(ev);
          const alt = altCopy(ev);
          const stack = ev.stacks[0];
          return (
            <article
              key={slip.size}
              className="panel relative flex w-full min-w-0 flex-col overflow-hidden p-4 pl-5"
            >
              <span className={`absolute inset-y-0 left-0 w-0.5 ${tone.bar}`} aria-hidden />
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="kicker break-words">
                    {slip.size}-man · {tone.kicker}
                    {settled ? ` · ${payout.kind}` : ` · ${ev.kind}`}
                  </p>
                  <h3 className="font-display mt-1 text-2xl font-semibold tracking-tight">{slip.title}</h3>
                </div>
                <div className="w-20 shrink-0 text-right">
                  <p className="text-xs tracking-wider text-faint uppercase">{settled ? payoutLabel(payout) : "EV"}</p>
                  <p
                    className={`font-display text-3xl leading-none font-semibold tabular-nums sm:text-4xl ${
                      settled && payout.units != null
                        ? payout.units > 0
                          ? "text-pine"
                          : payout.units < 0
                            ? "text-brick"
                            : ""
                        : ev.size === "pass"
                          ? "text-brick"
                          : ev.size === "max"
                            ? "text-pine"
                            : ""
                    }`}
                  >
                    {settled && payout.multiplier != null ? formatMult(payout.multiplier) : formatEv(ev.correlated)}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {settled ? (
                  <Badge variant={payoutVariant(payout.status)}>{payoutLabel(payout)}</Badge>
                ) : (
                  <Badge variant={leanVariant(slip.lean)}>{slip.lean}</Badge>
                )}
                <Badge variant={sizeVariant(ev.size)}>{sizeLabel(ev.size)}</Badge>
                <span className="min-w-0 text-xs break-words text-faint tabular-nums">
                  {slip.legs.length} exclusive legs
                  {settled && payout.units != null
                    ? ` · ${formatUnits(payout.units)}`
                    : ` · need ${formatCoverPct(ev.breakEven)}`}
                  {ev.quarterKelly > 0 ? ` · 1/4 Kelly ${formatKelly(ev.quarterKelly)}` : ""}
                  {stack ? ` · ${stack.n} ${stack.team}` : ""}
                </span>
              </div>
              {drag ? <p className="mt-2 text-xs text-brick">{drag}</p> : null}
              {alt ? <p className="mt-2 text-xs text-muted">{alt}</p> : null}
              <ol className="enter-stagger mt-4 flex flex-col gap-2">
                {slip.legs.map((leg, i) => {
                  const smash = isSmash(leg);
                  const badge = smash ? { label: "Smash", variant: "smash" as const } : resultBadge(leg.result);
                  return (
                    <li key={`${slip.size}-${leg.playerId}-${leg.market}-${i}`}>
                      <button
                        type="button"
                        onClick={() => onOpen(leg.playerId, leg.market)}
                        className="flex w-full items-center gap-3 rounded-lg bg-elevated px-3 py-2.5 text-left transition-[box-shadow,transform] duration-150 ease-out hover:shadow-[var(--shadow-border)] active:scale-[0.96]"
                      >
                        <span className="font-display w-6 shrink-0 text-sm text-faint tabular-nums">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <img
                          src={headshotUrl(leg.playerId)}
                          alt=""
                          className="size-9 shrink-0 rounded-sm bg-bg object-cover outline outline-1 -outline-offset-1 outline-fg/10"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{leg.name}</span>
                          <span className="block truncate text-xs text-muted">
                            {lineCopy(leg)}
                            {leg.oddsType !== "standard" ? ` · ${leg.oddsType}` : ""}
                            {Number.isFinite(leg.cover) ? ` · ${Math.round(leg.cover * 100)}% cover` : ""}
                            {leg.edge != null ? ` · ${leg.edge >= 0 ? "+" : "−"}${Math.abs(Math.round(leg.edge * 100))} vs juice` : ""}
                            {leg.actual != null ? ` · ${leg.actual}${smash ? " smash" : ""}` : ""}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          {badge ? (
                            <Badge variant={badge.variant}>{badge.label}</Badge>
                          ) : (
                            <>
                              <span className="block text-xs tracking-wider text-faint uppercase">{leg.teamAbbr}</span>
                              <span className="font-display text-lg font-semibold tabular-nums">{leg.score}</span>
                            </>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
              <p className="mt-4 text-xs leading-relaxed text-muted">{slip.notes}</p>
            </article>
          );
        })}
        {([2, 3, 6] as const)
          .filter((size) => !slips.some((s) => s.size === size))
          .map((size) => (
            <SkipSlot key={`skip-${size}`} size={size} />
          ))}
      </div>

      {log.length ? (
        <section className="panel p-5">
          <p className="kicker">Prior cards</p>
          <ul className="mt-3 flex flex-col gap-3">
            {log.slice(0, 4).map((entry) => {
              const day = reportOf(entry.slips);
              return (
                <li key={entry.date} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{entry.date}</p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {day.slips.length
                        ? day.slips.map((p) => payoutLabel(p)).join(" · ")
                        : entry.slips
                            .flatMap((s) => s.legs.map((l) => l.name.split(" ").slice(-1)[0]))
                            .slice(0, 6)
                            .join(" · ")}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-display text-xl font-semibold tabular-nums">
                      {entry.grade && entry.grade.n + entry.grade.dnp > 0 ? `${entry.grade.hits}/${entry.grade.n}` : "—"}
                    </p>
                    {day.units != null ? (
                      <p className={`text-xs tabular-nums ${unitsClass(day.units) || "text-muted"}`}>{formatUnits(day.units)}</p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="panel p-5">
        <p className="kicker">Slip glossary</p>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {SLIP_GLOSSARY.map((term) => (
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

function SkipSlot({ size, note }: { size: 2 | 3 | 6; note?: string }) {
  const title = size === 2 ? "Power 2" : size === 3 ? "Core 3" : "Flex 6";
  const why =
    note ||
    (size === 2
      ? "No pair cleared 1.02x on Ks, 0.5 contact, or 0.5 runs. Skip — not a loss."
      : size === 3
        ? "No three-leg core cleared 1.03x without leftover juice."
        : "Flex needs six legs at 1.03x. The desk will not fill with 1.5 leftovers.");
  return (
    <article className="panel relative flex min-h-48 w-full min-w-0 flex-col overflow-hidden p-4 pl-5">
      <span className={`absolute inset-y-0 left-0 w-0.5 ${CARD_TONE[size].bar} opacity-40`} aria-hidden />
      <p className="kicker">{size}-man · skip</p>
      <h3 className="font-display mt-1 text-2xl font-semibold tracking-tight text-muted">{title}</h3>
      <p className="font-serif mt-3 text-sm leading-relaxed text-muted italic">{why}</p>
    </article>
  );
}

function EmptySlots({ posted }: { posted: number[] }) {
  return (
    <div className="enter-stagger grid min-w-0 gap-4 lg:grid-cols-3">
      {([2, 3, 6] as const)
        .filter((size) => !posted.includes(size))
        .map((size) => (
          <SkipSlot key={size} size={size} />
        ))}
    </div>
  );
}

export function SlipGlossaryCard() {
  return (
    <Card>
      <div className="flex items-center gap-2 text-xs tracking-widest text-stone uppercase">
        <Layers className="size-3.5" />
        Slip glossary
      </div>
      <ul className="mt-3 flex flex-col gap-3">
        {SLIP_GLOSSARY.map((term) => (
          <li key={term.key}>
            <p className="text-xs font-medium tracking-wide uppercase">{term.label}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">{term.blurb}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
