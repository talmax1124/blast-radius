import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { PITCH_GLOSSARY } from "@/lib/mlb/glossary";
import { headshotUrl } from "@/lib/mlb/parse";
import { dominantFamily, familyFill, familyMix, primaryOf } from "@/lib/mlb/pitches";
import type { ArsenalCard, PitchFamily, PitchTypeRow } from "@/lib/mlb/types";

type Filter = "all" | PitchFamily;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "heat", label: "Heat" },
  { id: "break", label: "Break" },
  { id: "off", label: "Offspeed" },
];

export function MixBar({ pitches }: { pitches: PitchTypeRow[] }) {
  const total = pitches.reduce((sum, p) => sum + Math.max(p.usage, 0), 0) || 1;
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-elevated">
      {pitches.map((pitch) => (
        <span
          key={pitch.code}
          className={`h-full ${familyFill(pitch.family)}`}
          style={{ width: `${(pitch.usage / total) * 100}%` }}
          title={`${pitch.code} ${pitch.usage.toFixed(0)}%`}
        />
      ))}
    </div>
  );
}

export function PitchTable({ pitches, invertRv }: { pitches: PitchTypeRow[]; invertRv?: boolean }) {
  if (!pitches.length) {
    return <p className="mt-3 text-sm text-muted">No pitch-type splits on file.</p>;
  }
  return (
    <ul className="mt-3 flex flex-col gap-2">
      {pitches.map((pitch) => (
        <li key={pitch.code} className="rounded-md bg-elevated px-3 py-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-medium">
              {pitch.code}
              <span className="ml-2 text-xs text-muted">{pitch.name}</span>
            </span>
            <span className="text-xs tabular-nums text-faint">{pitch.usage.toFixed(0)}%</span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-bg">
            <span
              className={`block h-full rounded-full ${familyFill(pitch.family)}`}
              style={{ width: `${Math.min(pitch.usage, 100)}%` }}
            />
          </div>
          <dl className="mt-2 grid grid-cols-4 gap-2 text-xs">
            <div>
              <dt className="tracking-wider text-faint uppercase">Velo</dt>
              <dd className="font-display text-base font-semibold tabular-nums">
                {pitch.velo != null ? pitch.velo.toFixed(1) : "—"}
              </dd>
            </div>
            <div>
              <dt className="tracking-wider text-faint uppercase">Whiff</dt>
              <dd className="font-display text-base font-semibold tabular-nums">
                {pitch.whiff != null ? `${pitch.whiff.toFixed(0)}%` : "—"}
              </dd>
            </div>
            <div>
              <dt className="tracking-wider text-faint uppercase">{invertRv ? "xSLG" : "xwOBA"}</dt>
              <dd className="font-display text-base font-semibold tabular-nums">
                {invertRv
                  ? pitch.xslg != null
                    ? pitch.xslg.toFixed(3)
                    : "—"
                  : pitch.xwoba != null
                    ? pitch.xwoba.toFixed(3)
                    : "—"}
              </dd>
            </div>
            <div>
              <dt className="tracking-wider text-faint uppercase">RV/100</dt>
              <dd
                className={`font-display text-base font-semibold tabular-nums ${
                  pitch.rv100 == null ? "" : pitch.rv100 >= 0.4 ? "text-pine" : pitch.rv100 <= -0.4 ? "text-brick" : ""
                }`}
              >
                {pitch.rv100 == null ? "—" : `${pitch.rv100 >= 0 ? "+" : ""}${pitch.rv100.toFixed(1)}`}
              </dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}

export function ArsenalLab({
  board,
  onOpen,
}: {
  board: ArsenalCard[];
  onOpen: (playerId: number) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");

  const ranked = useMemo(() => {
    const copy = filter === "all" ? [...board] : board.filter((row) => dominantFamily(row.pitcher.arsenal) === filter);
    copy.sort((a, b) => (primaryOf(b.pitcher.arsenal)?.whiff ?? 0) - (primaryOf(a.pitcher.arsenal)?.whiff ?? 0));
    return copy;
  }, [board, filter]);

  const loud = useMemo(() => {
    return [...board]
      .filter((row) => row.pitcher.arsenal.length > 0)
      .sort((a, b) => (primaryOf(b.pitcher.arsenal)?.whiff ?? 0) - (primaryOf(a.pitcher.arsenal)?.whiff ?? 0))
      .slice(0, 3);
  }, [board]);

  if (board.length === 0) {
    return (
      <Card className="px-5 py-10 text-center text-sm text-muted">
        No starter arsenals on this slate. Run the desk again after the feed settles.
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="kicker">Pitch mix</p>
        <h2 className="font-display mt-1 text-4xl font-semibold tracking-tight">Arsenal lab</h2>
        <p className="mt-1 max-w-xl text-sm text-muted">
          Statcast pitch types for tonight's starters. Mix bars, then open a name for velo, whiff, and run value.
        </p>
      </div>

      <div className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:overflow-visible sm:px-0">
        {FILTERS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setFilter(s.id)}
            className={`h-9 shrink-0 rounded-md px-3 text-xs font-medium tracking-wider uppercase ${
              filter === s.id ? "bg-elevated text-fg shadow-[var(--shadow-border)]" : "text-muted"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {loud.length ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {loud.map((row, i) => {
            const primary = primaryOf(row.pitcher.arsenal);
            return (
              <button
                key={row.playerId}
                type="button"
                onClick={() => onOpen(row.playerId)}
                className="panel p-4 text-left transition-[box-shadow] duration-150 hover:shadow-[var(--shadow-border-hover)]"
              >
                <p className="text-xs tracking-widest text-faint uppercase">
                  Wipeout primary {String(i + 1).padStart(2, "0")}
                </p>
                <p className="font-display mt-2 truncate text-2xl font-semibold">{row.name}</p>
                <p className="text-xs text-muted">
                  {row.teamAbbr} vs {row.opponentAbbr}
                </p>
                <p className="mt-3 font-display text-3xl font-semibold tabular-nums">
                  {primary ? `${primary.code} ${primary.whiff?.toFixed(0) ?? "—"}%` : "—"}
                </p>
                <p className="text-xs text-faint">
                  whiff
                  {primary?.velo != null ? ` · ${primary.velo.toFixed(1)} mph` : ""}
                  {primary ? ` · ${primary.usage.toFixed(0)}% of mix` : ""}
                </p>
              </button>
            );
          })}
        </div>
      ) : null}

      <ol className="flex flex-col gap-3">
        {ranked.map((row) => {
          const mix = familyMix(row.pitcher.arsenal);
          const primary = primaryOf(row.pitcher.arsenal);
          return (
            <li key={row.playerId}>
              <button
                type="button"
                onClick={() => onOpen(row.playerId)}
                className="panel w-full p-4 text-left transition-[box-shadow] duration-150 hover:shadow-[var(--shadow-border-hover)]"
              >
                <div className="flex items-start gap-3">
                  <img
                    src={headshotUrl(row.playerId)}
                    alt=""
                    className="size-12 shrink-0 rounded-md bg-elevated object-cover outline outline-1 -outline-offset-1 outline-fg/10"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="truncate font-medium">{row.name}</p>
                      <p className="text-xs text-muted">
                        {row.teamAbbr} vs {row.opponentAbbr}
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-faint">
                      {primary
                        ? `${primary.code} ${primary.usage.toFixed(0)}% · ${primary.velo != null ? `${primary.velo.toFixed(1)} mph` : "—"}`
                        : "No mix on file"}
                      {row.pitcher.xera != null ? ` · ${row.pitcher.xera.toFixed(2)} xERA` : ""}
                    </p>
                    <div className="mt-3">
                      <MixBar pitches={row.pitcher.arsenal} />
                    </div>
                    <p className="mt-2 text-xs tabular-nums text-faint">
                      Heat {mix.heat.toFixed(0)} · Break {mix.break.toFixed(0)} · Off {mix.off.toFixed(0)}
                    </p>
                    <ul className="mt-3 hidden gap-2 sm:grid sm:grid-cols-3">
                      {row.pitcher.arsenal.slice(0, 3).map((pitch) => (
                        <li key={pitch.code} className="rounded-md bg-elevated px-2 py-1.5">
                          <p className="text-xs tracking-wider text-faint uppercase">{pitch.code}</p>
                          <p className="font-display text-lg font-semibold tabular-nums">
                            {pitch.whiff != null ? `${pitch.whiff.toFixed(0)}%` : "—"}
                            <span className="ml-1 text-xs font-normal text-muted">whiff</span>
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ol>

      <section className="panel p-5 lg:hidden">
        <p className="text-xs tracking-widest text-stone uppercase">Pitch glossary</p>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {PITCH_GLOSSARY.map((term) => (
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

export function PitchGlossaryCard() {
  return (
    <Card>
      <p className="text-xs tracking-widest text-stone uppercase">Pitch glossary</p>
      <ul className="mt-3 flex flex-col gap-3">
        {PITCH_GLOSSARY.map((term) => (
          <li key={term.key}>
            <p className="text-xs font-medium tracking-wide uppercase">{term.label}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">{term.blurb}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
