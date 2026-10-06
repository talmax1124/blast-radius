import test from "node:test";
import assert from "node:assert/strict";
import { simulate, wilson, walkForward, pairedObservations, type Condition } from "./simulation.ts";
const conditions: Condition[] = [
  { metric: 0, line: 0.5, side: "over" },
  { metric: 1, line: 0.5, side: "over" },
];
const observed = Array.from({ length: 20 }, (_, i) => ({
  id: String(i),
  date: `2026-09-${String(i + 1).padStart(2, "0")}T20:00:00Z`,
  values: [i % 2, i % 2],
}));
test("joint simulation preserves perfect dependence rather than multiplying marginal rates", () => {
  const result = simulate(observed, conditions);
  assert.ok(Math.abs(result.exact - 0.5) < 1e-12);
  assert.ok(Math.abs(result.independent - 0.25) < 1e-12);
  assert.ok(Math.abs(result.probability - 0.5) < 0.015);
  assert.deepEqual(result, simulate(observed, conditions));
  const allWin = simulate(
    observed.map((o) => ({ ...o, values: [1, 1] })),
    conditions,
  );
  assert.equal(allWin.probability, 1);
  assert.ok(Number.isFinite(allWin.mcError));
  assert.equal(result.probability + result.push + result.loss, 1);
  assert.deepEqual(
    result.histogram.map((b) => b.value),
    [0, 1],
  );
});
test("anti-correlated conditions cannot both win; pushes are distinct from losses", () => {
  const anti = observed.map((o) => ({ ...o, values: [o.values[0], 1 - o.values[0]] }));
  assert.equal(simulate(anti, conditions).probability, 0);
  const pushConditions = conditions.map((c) => ({ ...c, line: 0 }));
  const result = simulate(observed, pushConditions);
  assert.equal(result.loss, 0);
  assert.equal(result.probability + result.push, 1);
  const contradiction = [conditions[0], { ...conditions[1], side: "under" as const }];
  assert.equal(simulate(observed, contradiction).probability, 0);
});
test("scenario tilt is monotonic, bounded, and lowers effective sample size", () => {
  const low = simulate(observed, conditions, -1),
    mid = simulate(observed, conditions),
    high = simulate(observed, conditions, 1);
  assert.ok(low.exact < mid.exact && mid.exact < high.exact);
  assert.ok(high.effectiveN < observed.length);
  assert.throws(() => simulate(observed.slice(0, 4), conditions));
  assert.throws(() => simulate(observed, conditions, Infinity));
  assert.throws(() => simulate(observed, conditions, 0, 42, 1e9));
});
test("Wilson interval has correct reference values and remains nondegenerate at boundaries", () => {
  const [lo, hi] = wilson(5, 10);
  assert.ok(Math.abs(lo - 0.236593) < 0.00001);
  assert.ok(Math.abs(hi - 0.763407) < 0.00001);
  assert.ok(wilson(0, 10)[1] > 0.27);
  assert.ok(wilson(10, 10)[0] < 0.73);
});
test("walk-forward predictions exclude target and future outcomes, including same Eastern day", () => {
  const before = walkForward(observed, conditions);
  const changed = observed.map((o, i) => (i >= 10 ? { ...o, values: [1, 1] } : o));
  const after = walkForward(changed, conditions);
  assert.equal(before.folds[5].probability, after.folds[5].probability);
  assert.equal(before.folds[0].training, 5);
  assert.equal(before.folds.length, 15);
  assert.ok(before.brier! >= 0 && before.brier! <= 1);
  const sameDay = [
    ...observed.slice(0, 5),
    { id: "a", date: "2026-09-06T20:00Z", values: [1, 1] },
    { id: "b", date: "2026-09-07T01:00Z", values: [1, 1] },
  ];
  assert.deepEqual(
    walkForward(sameDay, conditions).folds.map((f) => f.training),
    [5, 5],
  );
});
test("paired source extraction rejects missing, compound, duplicate, and invalid-date records", () => {
  const row = (id: string, stats: string[]) => ({
    id,
    date: "2026-09-01T20:00Z",
    stats,
    opponent: "",
    opponentId: "",
    location: "",
    result: "",
    seasonType: "",
  });
  const rows = [
    row("1", ["0", "1"]),
    row("1", ["0", "1"]),
    row("2", ["", "2"]),
    row("3", ["2-4", "2"]),
    { ...row("4", ["1", "1"]), date: "bad" },
  ];
  assert.equal(pairedObservations(rows, conditions).length, 1);
});
