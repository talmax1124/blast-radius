import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSlips } from "./slips.ts";
import { isSkipDay } from "./recap.ts";
import { reportOf } from "./grade.ts";

describe("buildSlips", () => {
  it("always returns Power, Core, and Flex — skips are not missing lanes", () => {
    const slips = buildSlips([], [], "2026-09-18");
    assert.equal(slips.length, 3);
    assert.deepEqual(
      slips.map((s) => s.size).sort((a, b) => a - b),
      [2, 3, 6],
    );
    assert.ok(slips.every((s) => s.skip && s.legs.length === 0));
  });

  it("does not count skip lanes as losses", () => {
    const slips = buildSlips([], [], "2026-09-18");
    const report = reportOf(slips);
    assert.equal(report.staked, 0);
    assert.equal(report.lost, 0);
    assert.equal(report.n, 0);
    assert.ok(
      isSkipDay({
        date: "2026-09-18",
        version: "3.1",
        slips,
        grade: { hits: 0, n: 0, dnp: 0, summary: "skip" },
      }),
    );
  });
});
