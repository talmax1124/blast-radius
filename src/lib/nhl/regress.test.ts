import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cashProb, cashLogit, clearsCashGate } from "./regress.ts";

describe("cash gate", () => {
  it("rejects the Oct 11 miss", () => {
    assert.equal(clearsCashGate({ market: "assist", lambda: 0.75, line: 0.5, b2b: true }), false);
    assert.equal(clearsCashGate({ market: "shot", lambda: 2.7, line: 2.5, b2b: true }), false);
    assert.equal(clearsCashGate({ market: "goal", lambda: 0.3, line: 0.5 }), false);
  });

  it("keeps the point that cashed in the same Carolina win", () => {
    assert.equal(clearsCashGate({ market: "point", lambda: 1.2, line: 0.5, b2b: true }), true);
  });

  it("is a probability", () => {
    const p = cashProb(cashLogit({ market: "point", lambda: 1.4, line: 0.5 }));
    assert.ok(p > 0.7 && p < 0.9);
  });
});
