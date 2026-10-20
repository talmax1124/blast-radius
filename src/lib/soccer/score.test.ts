import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCard, pAtLeast, posOf, projectPlayer, shrink } from "./score.ts";

describe("touch rate", () => {
  it("pulls two starts toward a forward prior", () => {
    const hot = shrink(6, 3.1, 2);
    assert.ok(hot < 4.2, `hot ${hot}`);
    assert.ok(hot > 3.1);
  });

  it("cashes a real shot rate and refuses a midfielder prior", () => {
    const finisher = projectPlayer({ pos: "F", starts: 12, shots: 48, sot: 18, goals: 8 });
    assert.equal(finisher.cashShots, 1.5);
    assert.ok(finisher.pShots15 > 0.7);
    const prior = projectPlayer({ pos: "M", starts: 0, shots: 0, sot: 0, goals: 0 });
    assert.equal(prior.cashShots, null);
  });

  it("counts two shots as the complement of zero and one", () => {
    const p = pAtLeast(3, 2);
    const manual = 1 - Math.exp(-3) * (1 + 3);
    assert.ok(Math.abs(p - Math.min(0.99, manual)) < 0.001);
    assert.equal(posOf("FW"), "F");
    assert.equal(posOf("G"), null);
  });

  it("will not build a card from one game", () => {
    const legs = buildCard([
      { id: "a", name: "A", team: "AAA", gameId: "1", starts: 10, shots: 4, cover: 0.8, cash: 1.5 },
      { id: "b", name: "B", team: "BBB", gameId: "1", starts: 10, shots: 3.5, cover: 0.7, cash: 1.5 },
    ]);
    assert.equal(legs.length, 1);
    assert.equal(legs[0].id, "a");
  });
});
