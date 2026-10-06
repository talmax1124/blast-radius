import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pAtLeast, projectSkater, shrinkRate, slipSweep } from "./score.ts";

describe("ICE", () => {
  it("puts most of a two-shot rate over 1.5", () => {
    const p = pAtLeast(2.6, 2);
    assert.ok(p > 0.7 && p < 0.8);
  });

  it("keeps a cold two-game start near the career shot rate", () => {
    const rate = shrinkRate(1, 2.6, 2);
    assert.ok(rate > 2.3 && rate < 2.5);
  });

  it("keeps a short career on the board with a forward prior", () => {
    const row = projectSkater({
      gp: 2,
      seasonSog: 4,
      careerGp: 8,
      careerSog: 20,
      seasonGoals: 0,
      careerGoals: 2,
      seasonPts: 0,
      careerPts: 4,
      home: true,
      pos: "F",
    });
    assert.ok(row.lambdaSog > 1 && row.lambdaSog < 2.4);
  });

  it("multiplies a three-leg sweep", () => {
    assert.equal(Number(slipSweep([0.8, 0.7, 0.6]).toFixed(3)), 0.336);
  });
});
