import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { EDGE_GLOSSARY } from "@/lib/mlb/glossary";
import { headshotUrl } from "@/lib/mlb/parse";
import type { EdgeKind, EdgeRow } from "@/lib/mlb/types";

type Filter = "all" | EdgeKind;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "platoon", label: "Platoon" },
  { id: "steal", label: "Steals" },
  { id: "fly", label: "Fly ball" },
  { id: "mix", label: "Mix" },
  { id: "climate", label: "K climate" },
  { id: "luck", label: "Due" },
  { id: "home", label: "Home" },
  { id: "night", label: "Night" },
  { id: "rbi", label: "RBI" },
];

const KIND_TONE: Record<EdgeKind, string> = {
  platoon: "text-fg",
  steal: "text-pine",
  fly: "text-brick",
  mix: "text-fg",
  climate: "text-stone",
  luck: "text-pine",
  home: "text-fg",
  night: "text-brick",
  rbi: "text-fg",
};

export function EdgesLab({
  board,
  onOpen,
}: {
  board: EdgeRow[];
  onOpen: (playerId: number, market: EdgeRow["market"]) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");

  const ranked = useMemo(() => {
    const copy = filter === "all" ? [...board] : board.filter((row) => row.kind === filter);
    copy.sort((a, b) => b.score - a.score);
    return copy;
  }, [board, filter]);

  const loud = ranked.slice(0, 3);

  if (board.length === 0) {
    return (
      <Card className="px-5 py-10 text-center text-sm text-muted">
        No live edges on this slate. Run the desk again after the feeds settle.
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="kicker">Matchup levers</p>
        <h2 className="font-display mt-1 text-4xl font-semibold tracking-tight">Edges lab</h2>
        <p className="mt-1 max-w-xl text-sm text-muted">
          Platoon splits, night mashers, fly-ball parks, mix, luck, and table-setters — the extra levers on every prop.
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
          {loud.map((row, i) => (
            <button
              key={row.id}
              type="button"
              onClick={() => row.playerId && onOpen(row.playerId, row.market)}
              className="panel p-4 text-left transition-[box-shadow] duration-150 hover:shadow-[var(--shadow-border-hover)]"
            >
              <p className="text-xs tracking-widest text-faint uppercase">
                {row.title} {String(i + 1).padStart(2, "0")}
              </p>
              <p className="font-display mt-2 truncate text-2xl font-semibold">{row.name}</p>
              <p className="text-xs text-muted">
                {row.teamAbbr} vs {row.opponentAbbr}
              </p>
              <p className={`mt-3 font-display text-3xl font-semibold tabular-nums ${KIND_TONE[row.kind]}`}>{row.score}</p>
              <p className="mt-1 text-xs leading-relaxed text-faint">{row.detail}</p>
            </button>
          ))}
        </div>
      ) : null}

      <ol className="flex flex-col gap-2">
        {ranked.map((row, index) => (
          <li key={row.id}>
            <button
              type="button"
              onClick={() => row.playerId && onOpen(row.playerId, row.market)}
              className="flex w-full items-center gap-3 rounded-lg bg-surface px-3 py-3 text-left shadow-[var(--shadow-border)] transition-[box-shadow] duration-150 hover:shadow-[var(--shadow-border-hover)]"
            >
              <span className="font-display w-8 shrink-0 text-lg text-faint tabular-nums">
                {String(index + 1).padStart(2, "0")}
              </span>
              {row.playerId ? (
                <img
                  src={headshotUrl(row.playerId)}
                  alt=""
                  className="size-10 shrink-0 rounded-sm bg-elevated object-cover outline outline-1 -outline-offset-1 outline-fg/10"
                />
              ) : null}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{row.name}</span>
                <span className="block truncate text-xs text-muted">{row.detail}</span>
              </span>
              <span className="hidden shrink-0 text-xs tracking-wider text-faint uppercase sm:block">{row.title}</span>
              <span className="font-display w-10 shrink-0 text-right text-2xl font-semibold tabular-nums">{row.score}</span>
            </button>
          </li>
        ))}
      </ol>

      <section className="panel p-5 lg:hidden">
        <p className="text-xs tracking-widest text-stone uppercase">Edge glossary</p>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {EDGE_GLOSSARY.map((term) => (
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

export function EdgeGlossaryCard() {
  return (
    <Card>
      <p className="text-xs tracking-widest text-stone uppercase">Edge glossary</p>
      <ul className="mt-3 flex flex-col gap-3">
        {EDGE_GLOSSARY.map((term) => (
          <li key={term.key}>
            <p className="text-xs font-medium tracking-wide uppercase">{term.label}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">{term.blurb}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
