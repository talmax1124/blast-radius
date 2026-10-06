import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { simulateMonday } from "./monday.ts";

describe("monday card", () => {
  it("keeps a two-and-two card and does not call it a lock", () => {
    const card = simulateMonday(5000);
    assert.equal(card.legs.length, 4);
    const teams = card.legs.map((leg) => leg.team).sort();
    assert.deepEqual(teams, ["CHI", "CHI", "PHI", "PHI"]);
    const names = card.legs.map((leg) => leg.player).sort();
    assert.deepEqual(names, ["D'Andre Swift", "DeVonta Smith", "Dontayvion Wicks", "Kalif Raymond"]);
    assert.ok(card.legs.every((leg) => leg.p >= 0.57 && leg.p <= 0.9));
    assert.ok(card.sweep > 0.2 && card.sweep < 0.45, `sweep ${card.sweep}`);
    assert.ok(card.blowout > 0.1 && card.blowout < 0.22, `blowout ${card.blowout}`);
    assert.ok(card.oneScore > 0.35 && card.oneScore < 0.55);
    assert.ok(card.legs.find((leg) => leg.player === "DeVonta Smith")?.label === "Receptions");
    assert.ok(card.legs.find((leg) => leg.player === "Kalif Raymond")?.label === "Receptions");
  });
});
