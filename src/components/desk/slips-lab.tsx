import { Layers } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

function resultBadge(result: LegResult | undefined): { label: string; variant: "pine" | "brick" | "default" } | null {
  if (result === "hit") return { label: "Hit", variant: "pine" };
  if (result === "miss") return { label: "Miss", variant: "brick" };
  if (result === "dnp") return { label: "DNP", variant: "default" };
  return null;
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
      <Card className="rounded-xl px-5 py-10 text-center text-sm text-muted">
        No PrizePicks lines cleared the cover floor. Aces on the slate push the desk toward pitcher Ks — run it again after lineups confirm.
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="font-display text-3xl font-semibold tracking-tight">Daily slips</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          HR / hits / TB overs vs aces stay off. Core counting (H+R+RBI, fantasy score, runs) can still sit vs an ace. Demons sit on Flex. Names under {CHALK_SCORE} never repeat.
          {lineCount ? " PrizePicks board is live." : ""}
        </p>
      </div>

      {grade && grade.n + grade.dnp > 0 ? (
        <div className="rounded-xl bg-surface px-4 py-3 shadow-[var(--shadow-border)]">
          <p className="text-xs tracking-widest text-stone uppercase">Graded card</p>
          <p className="font-display mt-1 text-3xl font-semibold tabular-nums">
            {grade.hits}/{grade.n}
          </p>
          <p className="mt-1 text-sm text-muted">{grade.summary}</p>
        </div>
      ) : (
        <p className="text-sm text-muted">
          Card is open. Grades post from MLB boxes once games go Final — no need to re-fetch PrizePicks.
        </p>
      )}

      <div className="enter-stagger grid gap-4 lg:grid-cols-3">
        {slips.map((slip) => {
          const tone = CARD_TONE[slip.size];
          return (
            <article
              key={slip.size}
              className="relative flex flex-col overflow-hidden rounded-xl bg-surface p-4 pl-5 shadow-[var(--shadow-border)]"
            >
              <span className={`absolute inset-y-0 left-0 w-1 ${tone.bar}`} aria-hidden />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs tracking-widest text-faint uppercase">
                    {slip.size}-man · {tone.kicker}
                  </p>
                  <h3 className="font-display mt-1 text-2xl font-semibold tracking-tight">{slip.title}</h3>
                </div>
                <div className="text-right">
                  <p className="text-xs tracking-wider text-faint uppercase">Cover</p>
                  <p className="font-display text-4xl leading-none font-semibold tabular-nums">{slip.confidence}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Badge variant={leanVariant(slip.lean)}>{slip.lean}</Badge>
                <span className="text-xs text-faint">{slip.legs.length} exclusive legs</span>
              </div>
              <ol className="enter-stagger mt-4 flex flex-col gap-2">
                {slip.legs.map((leg, i) => {
                  const badge = resultBadge(leg.result);
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
                            {leg.actual != null ? ` · ${leg.actual}` : ""}
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
      </div>

      {log.length ? (
        <section className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]">
          <p className="text-xs tracking-widest text-stone uppercase">Prior cards</p>
          <ul className="mt-3 flex flex-col gap-3">
            {log.slice(0, 4).map((entry) => (
              <li key={entry.date} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{entry.date}</p>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {entry.slips
                      .flatMap((s) => s.legs.map((l) => l.name.split(" ").slice(-1)[0]))
                      .slice(0, 6)
                      .join(" · ")}
                  </p>
                </div>
                <p className="shrink-0 font-display text-xl font-semibold tabular-nums">
                  {entry.grade && entry.grade.n + entry.grade.dnp > 0 ? `${entry.grade.hits}/${entry.grade.n}` : "—"}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]">
        <p className="text-xs tracking-widest text-stone uppercase">Slip glossary</p>
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

export function SlipGlossaryCard() {
  return (
    <Card className="rounded-xl">
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
