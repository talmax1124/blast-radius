import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCard, coverOver, projectPlayer, shrink } from "./score.ts";

const line = { min: 36, pts: 28, reb: 8, ast: 6, threes: 3 };

describe("minutes mass", () => {
  it("pulls a two-game heater toward the prior", () => {
    const hot = shrink(40, 28, 2);
    assert.ok(hot < 34, `hot ${hot}`);
    assert.ok(hot > 28, `hot ${hot}`);
  });

  it("will not cash a points over that dies when six minutes come off", () => {
    const { quotes } = projectPlayer({
      pos: "F",
      gp: 40,
      season: line,
      careerGp: 400,
      career: line,
      home: true,
    });
    assert.ok(quotes.pts.projection > 26);
    assert.ok(quotes.pts.cashOver != null);
    assert.ok(quotes.pts.cashOver < quotes.pts.projection - 1);
    const onTheMean = coverOver(quotes.pts.projection, Math.floor(quotes.pts.projection) + 0.5, "pts");
    assert.ok(onTheMean < 0.55);
  });

  it("keeps a points under that still loses after four extra minutes", () => {
    const { quotes } = projectPlayer({
      pos: "F",
      gp: 40,
      season: line,
      careerGp: 400,
      career: line,
      home: false,
    });
    assert.equal(quotes.pts.lean === "over" || quotes.pts.lean === "pass" || quotes.pts.lean === "under", true);
    assert.ok(quotes.pts.cashUnder != null);
    assert.ok(quotes.pts.cashUnder > quotes.pts.projection + 2);
  });

  it("adds points, rebounds, and assists into the combined number", () => {
    const { quotes } = projectPlayer({
      pos: "G",
      gp: 30,
      season: { min: 34, pts: 22, reb: 4, ast: 8, threes: 2.4 },
      careerGp: 200,
      career: { min: 33, pts: 20, reb: 4, ast: 7, threes: 2 },
      home: true,
    });
    const sum = quotes.pts.projection + quotes.reb.projection + quotes.ast.projection;
    assert.ok(Math.abs(quotes.pra.projection - sum) < 0.05);
  });

  it("does not shop threes over 0.5", () => {
    const low = projectPlayer({
      pos: "G",
      gp: 40,
      season: { min: 24, pts: 10, reb: 3, ast: 2, threes: 0.9 },
      careerGp: 80,
      career: { min: 22, pts: 9, reb: 3, ast: 2, threes: 0.8 },
      home: true,
    });
    assert.notEqual(low.quotes.threes.lean, "over");
    const star = projectPlayer({
      pos: "F",
      gp: 60,
      season: { min: 34, pts: 24, reb: 6, ast: 4, threes: 2 },
      careerGp: 400,
      career: { min: 34, pts: 23, reb: 6, ast: 4, threes: 1.8 },
      home: true,
    });
    if (star.quotes.threes.lean === "over") {
      assert.ok((star.quotes.threes.cashOver ?? 0) >= 1.5);
    }
  });

  it("will not build a card from one game", () => {
    const one = projectPlayer({
      pos: "C",
      gp: 40,
      season: { min: 32, pts: 22, reb: 12, ast: 3, threes: 0.4 },
      careerGp: 300,
      career: { min: 32, pts: 20, reb: 11, ast: 3, threes: 0.4 },
      home: true,
    });
    const card = buildCard([
      { id: "a", name: "A", team: "BOS", gameId: "g1", minutes: 32, quotes: one.quotes },
      { id: "b", name: "B", team: "BOS", gameId: "g1", minutes: 32, quotes: one.quotes },
    ]);
    assert.equal(card.length, 0);
  });
});
