import { useMemo, useState } from "react";
import type { PlayerLog } from "@/lib/research/workbench";
import {
  pairedObservations,
  simulate,
  walkForward,
  type Condition,
} from "@/lib/research/simulation";

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const control = "mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm";

export function SimulationLab({
  rows,
  metric,
  label,
  line,
  selectable,
}: {
  rows: PlayerLog["rows"];
  metric: number;
  label: string;
  line: string;
  selectable: { label: string; index: number }[];
}) {
  const [side, setSide] = useState<"over" | "under">("over");
  const [second, setSecond] = useState("");
  const [secondLine, setSecondLine] = useState("");
  const [secondSide, setSecondSide] = useState<"over" | "under">("over");
  const [strength, setStrength] = useState(0.5);
  const [seed, setSeed] = useState(42);
  const [open, setOpen] = useState(false);
  const valid =
    line.trim() !== "" &&
    Number.isFinite(Number(line)) &&
    (second === "" || (secondLine.trim() !== "" && Number.isFinite(Number(secondLine))));
  const analysis = useMemo(() => {
    if (!open || !valid) return null;
    const conditions: Condition[] = [{ metric, line: Number(line), side }];
    if (second !== "")
      conditions.push({ metric: Number(second), line: Number(secondLine), side: secondSide });
    const observations = pairedObservations(rows, conditions);
    if (observations.length < 5)
      return { n: observations.length, scenarios: null, validation: null };
    return {
      n: observations.length,
      scenarios: [-strength, 0, strength].map((tilt) =>
        simulate(observations, conditions, tilt, seed),
      ),
      validation: walkForward(observations, conditions),
    };
  }, [open, valid, metric, line, side, second, secondLine, secondSide, rows, strength, seed]);
  const baseline = analysis?.scenarios?.[1];
  return (
    <section
      className="my-5 rounded-xl border border-pine/30 bg-surface p-4"
      aria-label="Simulation lab"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="desk-eyebrow">Scenario testing</p>
          <h5 className="mt-2 text-lg font-medium">Simulate the outcomes together.</h5>
        </div>
        <button
          className="rounded-md border border-pine/40 px-4 py-2 text-sm text-pine"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? "Close simulation lab" : "Open simulation lab"}
        </button>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        20,000 resampled games per scenario, using the player, season, sample, and split selected
        above. Add a second statistic from the same player to preserve observed relationships
        between outcomes.
      </p>
      {open && (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs text-muted">
              {label || "Primary statistic"} · line {line || "required above"}
              <select
                aria-label="Simulation primary direction"
                className={control}
                value={side}
                onChange={(e) => setSide(e.target.value as "over" | "under")}
              >
                <option value="over">Over</option>
                <option value="under">Under</option>
              </select>
            </label>
            <label className="text-xs text-muted">
              Combine with
              <select
                aria-label="Simulation second statistic"
                className={control}
                value={second}
                onChange={(e) => setSecond(e.target.value)}
              >
                <option value="">Single condition</option>
                {selectable
                  .filter((s) => s.index !== metric)
                  .map((s) => (
                    <option key={s.index} value={s.index}>
                      {s.label}
                    </option>
                  ))}
              </select>
            </label>
            {second !== "" && (
              <>
                <label className="text-xs text-muted">
                  Second line
                  <input
                    aria-label="Simulation second line"
                    className={control}
                    type="number"
                    step="any"
                    value={secondLine}
                    onChange={(e) => setSecondLine(e.target.value)}
                  />
                </label>
                <label className="text-xs text-muted">
                  Second direction
                  <select
                    aria-label="Simulation second direction"
                    className={control}
                    value={secondSide}
                    onChange={(e) => setSecondSide(e.target.value as "over" | "under")}
                  >
                    <option value="over">Over</option>
                    <option value="under">Under</option>
                  </select>
                </label>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <label className="min-w-48 flex-1 text-xs text-muted">
              Scenario tilt strength · {strength.toFixed(1)}
              <input
                aria-label="Scenario tilt strength"
                className="mt-2 block w-full accent-pine"
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={strength}
                onChange={(e) => setStrength(Number(e.target.value))}
              />
            </label>
            <button
              className="rounded border border-border px-3 py-2 text-xs"
              onClick={() => setSeed((s) => s + 1)}
            >
              Rerun with new seed
            </button>
            <span className="text-[11px] text-muted">Seed {seed} · v1 empirical bootstrap</span>
          </div>
          {!valid ? (
            <p className="text-sm text-amber-400">
              Enter the primary prop line above and a second line if combining statistics.
            </p>
          ) : !baseline ? (
            <p className="text-sm text-amber-400">
              At least 5 complete games are required. This selection has {analysis?.n ?? 0}; expand
              the sample or change the split.
            </p>
          ) : (
            <>
              <p className="text-xs text-muted">
                {analysis!.n} complete source games · {rows.length - analysis!.n} excluded for
                missing or invalid values.{" "}
                {analysis!.n < 20
                  ? "Small sample: results are highly sensitive to individual games."
                  : "Historical relationships can change with role and opponent."}
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {analysis!.scenarios!.map((s, i) => (
                  <article
                    key={i}
                    className={`rounded-lg border p-3 ${i === 1 ? "border-pine/40" : "border-border"}`}
                  >
                    <h6 className="text-xs text-muted">
                      {
                        [
                          "Favor lower primary values",
                          "Observed sample baseline",
                          "Favor higher primary values",
                        ][i]
                      }
                    </h6>
                    <p className="mt-2 font-mono text-3xl">{pct(s.probability)}</p>
                    <p className="mt-1 text-xs text-muted">
                      {second ? "Both conditions win" : "Condition wins"}
                    </p>
                    <div
                      className="mt-3 flex h-2 overflow-hidden rounded"
                      role="img"
                      aria-label={`Win ${pct(s.probability)}, unresolved push ${pct(s.push)}, loss ${pct(s.loss)}`}
                    >
                      <span className="bg-pine" style={{ width: pct(s.probability) }} />
                      <span className="bg-amber-400" style={{ width: pct(s.push) }} />
                      <span className="bg-muted/40" style={{ width: pct(s.loss) }} />
                    </div>
                    <p className="mt-2 text-[11px] text-muted">
                      Push {pct(s.push)} · Loss {pct(s.loss)}
                    </p>
                    <p className="mt-2 text-[11px] text-muted">
                      Exact weighted rate {pct(s.exact)} · effective sample{" "}
                      {s.effectiveN.toFixed(1)}
                    </p>
                  </article>
                ))}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-border p-3">
                  <h6 className="text-sm font-medium">Historical sampling uncertainty</h6>
                  <p className="mt-2 font-mono text-xl">
                    {pct(baseline.interval[0])}–{pct(baseline.interval[1])}
                  </p>
                  <p className="mt-2 text-xs text-muted">
                    95% Wilson interval for the baseline joint hit rate, assuming independent,
                    representative games. This is not a next-game forecast interval.
                  </p>
                  <p className="mt-2 text-xs text-muted">
                    Monte Carlo sampling error ≈ ±{(baseline.mcError * 100).toFixed(2)} percentage
                    points. More trials reduce simulation noise, not uncertainty in the source
                    sample.
                  </p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <h6 className="text-sm font-medium">
                    {second ? "Dependence check" : "Walk-forward diagnostic"}
                  </h6>
                  {second && (
                    <>
                      <p className="mt-2 text-xs">
                        Same-game joint rate {pct(baseline.exact)} · independence assumption{" "}
                        {pct(baseline.independent)}
                      </p>
                      <p className="mt-2 text-xs text-muted">
                        Difference {((baseline.exact - baseline.independent) * 100).toFixed(1)}{" "}
                        percentage points. Multiplying marginal rates can misstate combined
                        outcomes.
                      </p>
                    </>
                  )}
                  <p className="mt-3 text-xs">
                    Brier score: {analysis!.validation!.brier?.toFixed(3) ?? "Not enough history"} ·{" "}
                    {analysis!.validation!.folds.length} held-out games
                  </p>
                  <p className="mt-2 text-xs text-muted">
                    Expanding-window baseline trained only on earlier days, with Laplace smoothing.
                    Lower is better (0–1); 0.250 is the constant 50% benchmark. Fewer than 20
                    held-out games is a weak diagnostic. This is a retrospective check at your
                    chosen threshold, not prospective calibration.
                  </p>
                </div>
              </div>
              <div>
                <h6 className="mb-3 text-sm font-medium">
                  Simulated {label} distribution · baseline
                </h6>
                <div
                  className="flex h-28 items-end gap-1 overflow-x-auto"
                  role="img"
                  aria-label={baseline.histogram
                    .map((b) => `${b.value}: ${pct(b.probability)}`)
                    .join(", ")}
                >
                  {baseline.histogram.map((b) => (
                    <div
                      key={b.value}
                      className="flex h-full min-w-6 flex-1 flex-col justify-end text-center"
                    >
                      <div
                        title={`${b.value}: ${pct(b.probability)}`}
                        className="min-h-px rounded-t bg-pine/70"
                        style={{
                          height: `${(b.probability / Math.max(...baseline.histogram.map((p) => p.probability))) * 80}%`,
                        }}
                      />
                      <span className="mt-1 text-[9px] text-muted">{b.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
          <details className="border-t border-border pt-3 text-xs text-muted">
            <summary className="cursor-pointer">Method, assumptions & sources</summary>
            <div className="mt-3 space-y-2 leading-relaxed">
              <p>
                We resample whole historical games with replacement. Both conditions always use the
                same game row; a draw never pairs statistics from different games. Exact-line
                outcomes remain pushes; a combination with a losing condition is a loss, and one
                with only wins/pushes is unresolved (no payout is modeled).
              </p>
              <p>
                Scenario weights are proportional to exp(tilt × z), where z is the primary
                statistic’s standardized value capped at ±3. This favors existing low or high games,
                preserves integer outcomes, and cannot generate outcomes outside the observed
                sample. Scenario strength is an assumption you control; news, injuries, weather, and
                live score do not automatically alter these weights.
              </p>
              <p>
                The simulation uses pregame history, not a forecast of the remaining live game. It
                does not model cross-player slips, prices, settlement rules, or expected profit. No
                simulation can guarantee an outcome or validate its own assumptions.
              </p>
              <p>
                <a
                  className="text-pine underline"
                  href="https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm"
                  target="_blank"
                  rel="noreferrer"
                >
                  NIST: Wilson intervals ↗
                </a>
                {" · "}
                <a
                  className="text-pine underline"
                  href="https://scikit-learn.org/stable/modules/calibration.html"
                  target="_blank"
                  rel="noreferrer"
                >
                  Probability evaluation & Brier scores ↗
                </a>
              </p>
            </div>
          </details>
        </div>
      )}
    </section>
  );
}
