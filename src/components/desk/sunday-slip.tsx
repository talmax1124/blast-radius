import { cushionOf, toAmerican } from "@/lib/board/kelly";
import { SUNDAY_NFL, sundaySweep } from "@/lib/nfl/sunday";

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export function SundaySlip() {
  const sweep = sundaySweep();
  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-border px-4 py-4 sm:px-5">
        <p className="kicker">NFL · Sunday</p>
        <h2 className="font-display mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{SUNDAY_NFL.title}</h2>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">
          The {SUNDAY_NFL.price} ticket still needs all three, about {pct(sweep)} to sweep. {SUNDAY_NFL.priceNote} Only a leg with 5 points of room over today's price is sized.
        </p>
      </div>
      <ol className="flex flex-col divide-y divide-border">
        {SUNDAY_NFL.legs.map((leg, index) => {
          const sized = cushionOf({ label: leg.player, p: leg.p, american: toAmerican(leg.price) }) >= 0.05;
          return (
            <li key={leg.player} className="px-4 py-3 sm:px-5">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="min-w-0 font-medium">
                  <span className="mr-2 tabular-nums text-faint">{index + 1}</span>
                  {leg.player}
                </h3>
                <span className="shrink-0 text-sm tabular-nums text-pine">
                  {leg.price} · {pct(leg.p)} · {sized ? "Sized" : "Pass"}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted">{leg.prop}</p>
              <p className="mt-1 text-sm leading-relaxed text-faint">{leg.why}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}