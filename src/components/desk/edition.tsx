import { payoutLabel, slipPayout } from "@/lib/mlb/grade";
import { agateLine, type EditionCopy } from "@/lib/mlb/copy";
import { formatDeskDate } from "@/lib/mlb/parse";
import type { DeskLogEntry } from "@/lib/mlb/recap";
import type { SlipCard } from "@/lib/mlb/types";
import { cn } from "@/lib/utils";

export function Folio({ copy }: { copy: EditionCopy }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <p className="kicker">{copy.folioLeft}</p>
      <p className="kicker hidden sm:block">{copy.folioMid}</p>
      <p className="kicker sm:text-right">{copy.folioRight}</p>
    </div>
  );
}

export function Nameplate({ sport = "mlb" }: { sport?: "mlb" | "nfl" | "nhl" | "board" }) {
  const kicker =
    sport === "nfl" ? "Goal line desk" : sport === "nhl" ? "Shot desk" : sport === "board" ? "Daily board" : "Home run desk";
  const league = sport === "nfl" ? "NFL" : sport === "nhl" ? "NHL" : sport === "board" ? "ALL" : "MLB";
  const link = (id: "mlb" | "nfl" | "nhl" | "board", href: string, label: string) => (
    <a href={href} className={sport === id ? "text-fg" : "text-faint hover:text-fg"}>
      {label}
    </a>
  );
  return (
    <div className="nameplate py-5 text-center sm:py-6">
      <p className="kicker">{kicker}</p>
      <h1 className="font-display mt-1 font-semibold tracking-tight">
        <span
          className={
            sport === "board"
              ? "block text-xs font-medium tracking-[0.28em] text-stone"
              : "block text-[0.32em] font-medium tracking-[0.42em] text-stone"
          }
        >
          {league}
        </span>
        <span className={sport === "board" ? "text-5xl sm:text-6xl" : "text-display"}>GREAT RUN</span>
      </h1>
      <p className="kicker mt-3 flex flex-wrap items-center justify-center gap-3">
        {link("board", "/board", "Board")}
        <span className="text-faint">/</span>
        {link("mlb", "/", "MLB")}
        <span className="text-faint">/</span>
        {link("nfl", "/nfl", "NFL")}
        <span className="text-faint">/</span>
        {link("nhl", "/nhl", "NHL")}
      </p>
    </div>
  );
}

export function Skyline({ copy }: { copy: EditionCopy }) {
  return (
    <p className="font-serif text-center text-sm leading-snug text-muted sm:text-base">
      <span className="font-display font-semibold text-fg not-italic">{copy.hed}</span>
      <span> — {copy.deck}</span>
    </p>
  );
}

export function SectionFlag({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px flex-1 bg-border" />
      <p className="kicker shrink-0">{children}</p>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

export function RecapSpread({
  copy,
  entry,
}: {
  copy: EditionCopy;
  entry: DeskLogEntry | null;
}) {
  return (
    <div className="grid overflow-hidden border border-border lg:grid-cols-[minmax(0,1.45fr)_minmax(16rem,0.9fr)]">
      <article className="bg-paper px-5 py-6 text-ink sm:px-7 sm:py-7">
        <p className="kicker text-ink/45">The recap</p>
        <h2 className="font-display mt-2 text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
          {copy.hed}
        </h2>
        <p className="font-serif mt-3 text-base leading-snug text-ink/70 italic">{copy.deck}</p>
        <p className="kicker mt-6 text-ink/45">{copy.dateline}</p>
        <DropLede text={copy.lede} />
        <p className="mt-4 max-w-prose text-sm leading-relaxed text-ink/55">{copy.nut}</p>
      </article>
      <AgateBox entry={entry} />
    </div>
  );
}

export function AgateBox({ entry }: { entry: DeskLogEntry | null }) {
  if (!entry?.slips.length) {
    return (
      <aside className="border-t border-border bg-surface px-5 py-6 lg:border-t-0 lg:border-l">
        <p className="kicker">Agate</p>
        <p className="font-serif mt-3 text-sm leading-relaxed text-muted italic">
          No final card in the book. The box waits on a Final.
        </p>
      </aside>
    );
  }
  return (
    <aside className="border-t border-border bg-surface px-5 py-5 lg:border-t-0 lg:border-l">
      <div className="flex items-baseline justify-between gap-3 border-b-2 border-fg/20 pb-2">
        <p className="kicker">Agate</p>
        <p className="agate text-faint">{formatDeskDate(entry.date)}</p>
      </div>
      <div className="mt-3 flex flex-col gap-4">
        {entry.slips.map((slip) => (
          <AgateSlip key={slip.size} slip={slip} />
        ))}
      </div>
    </aside>
  );
}

function DropLede({ text }: { text: string }) {
  const trimmed = text.trimStart();
  const ch = trimmed[0] ?? "";
  const rest = trimmed.slice(1);
  return (
    <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink/85">
      {ch ? <span className="drop-cap">{ch}</span> : null}
      {rest}
    </p>
  );
}

function AgateSlip({ slip }: { slip: SlipCard }) {
  const pay = slipPayout(slip);
  const n = pay.hits + pay.misses;
  const line = n ? `${pay.hits}-${pay.misses}` : pay.open ? "open" : "—";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 border-b border-border pb-1">
        <p className="agate uppercase tracking-wide text-fg">{slip.title}</p>
        <p className="agate text-muted">
          {line}
          <span className="ml-2 text-faint">{payoutLabel(pay)}</span>
        </p>
      </div>
      <ul className="mt-1.5 flex flex-col">
        {slip.legs.map((leg, i) => (
          <li
            key={`${slip.size}-${leg.playerId}-${leg.market}-${i}`}
            className={cn(
              "agate grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-0.5",
              leg.result === "miss" ? "text-brick" : leg.result === "hit" ? "text-fg" : "text-muted",
            )}
          >
            <span className="truncate">
              {leg.name.split(" ").slice(-1)[0]}, {leg.teamAbbr}
            </span>
            <span className="text-right text-faint">{agateLine(leg)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
