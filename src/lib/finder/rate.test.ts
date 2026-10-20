import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hitCard, researchLine } from "./rate.ts";

const game = (value: number, date: string, preseason = false) => ({ value, date, preseason });

describe("hit card", () => {
  it("keeps the season and the preseason apart", () => {
    const season = [28, 22, 31, 19, 30, 24].map((value, i) => game(value, `2026-04-${10 + i}`));
    const pre = [18, 26, 14].map((value, i) => game(value, `2026-10-0${i + 1}`, true));
    const card = hitCard(24.5, pre, season, pre);
    assert.equal(card.source, "preseason");
    assert.equal(card.l5 == null ? null : Number(card.l5.toFixed(2)), 0.33);
    assert.equal(card.pre == null ? null : Number(card.pre.toFixed(2)), 0.33);
    assert.equal(card.season == null ? null : Number(card.season.toFixed(2)), 0.5);
    assert.equal(card.streak, -1);
    assert.equal(card.n10, 3);
  });

  it("uses last regular season when this preseason is empty", () => {
    const season = [3, 4, 1, 5, 2].map((value, i) => game(value, `2026-04-0${i + 1}`));
    const card = hitCard(1.5, season, season, []);
    assert.equal(card.source, "season");
    assert.equal(card.pre, null);
    assert.equal(card.l5, 0.8);
    assert.equal(card.streak, 2);
    assert.ok((card.avg ?? 0) > 1.5);
  });

  it("puts a projection on the half under it", () => {
    assert.equal(researchLine(29.8), 29.5);
    assert.equal(researchLine(4.0), 3.5);
    assert.equal(researchLine(0), 0.5);
  });
});
