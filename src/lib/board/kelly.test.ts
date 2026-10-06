import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  drawdownRate,
  growthCurve,
  kellyFull,
  kellyRisk,
  kellyRow,
  logGrowth,
  optimizeSimultaneous,
  peakGrowth,
  sizedBets,
  toAmerican,
} from "./kelly.ts";

describe("kelly", () => {
  it("sizes a real edge and passes a juiced favorite", () => {
    const gibbs = kellyFull(0.8, toAmerican("−320"));
    assert.ok(Math.abs(gibbs - 0.16) < 0.005);
    const row = kellyRow({ label: "Denver", p: 0.67, american: -285 });
    assert.ok(row.full < 0);
    assert.equal(row.stake, 0);
    assert.ok(row.breakeven > row.p);
  });

  it("peaks at full Kelly and turns down past it", () => {
    const points = growthCurve(0.72, -130);
    const peak = peakGrowth(points);
    assert.equal(peak.multiple, 1);
    const twice = points.find((point) => point.multiple === 2);
    assert.ok(twice);
    assert.ok(twice.growth < peak.growth);
    assert.ok(logGrowth(0.72, -130, 0) === 0);
  });

  it("does not stake more than the bankroll when the singles are bet together", () => {
    const bets = [
      { label: "Gibbs", p: 0.8, american: -320 },
      { label: "McBride", p: 0.72, american: -169 },
      { label: "Allen", p: 0.72, american: -130 },
    ];
    const best = optimizeSimultaneous(bets);
    assert.ok(best.growth > 0);
    assert.ok(best.scale > 0 && best.scale <= 1);
  });

  it("flags a thin edge and a fatter drawdown at full Kelly", () => {
    const bets = [
      { label: "Gibbs", p: 0.8, american: -320 },
      { label: "McBride", p: 0.72, american: -169 },
      { label: "Allen", p: 0.72, american: -130 },
    ];
    const risk = kellyRisk(bets);
    assert.equal(risk.thinnest, "Gibbs");
    assert.ok(risk.cushion < 0.05);
    assert.ok(risk.pWorst > 0.01 && risk.pWorst < 0.03);
    assert.ok(risk.worstLoss > 0.3 && risk.worstLoss < 0.45);
    const cut = risk.shock.find((row) => row.cut === 0.05);
    assert.ok(cut);
    assert.ok(cut.growth < risk.shock[0].growth);
    assert.ok(risk.drawdownFull > risk.drawdownHalf);
    assert.ok(drawdownRate(bets, 0.5) === risk.drawdownHalf);
    assert.deepEqual(
      sizedBets(bets).map((bet) => bet.label),
      ["McBride", "Allen"],
    );
  });
});
