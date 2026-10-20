import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSlips, survivesShock, survivesSpike } from "./slips.ts";
import type { NflPick, NflQuote } from "./types.ts";

describe("Allen floor", () => {
  it("rejects a pass line that dies when the quarterback is 32 yards light", () => {
    assert.equal(survivesShock("pass", 275, 242.5, "QB"), false);
    assert.equal(survivesShock("pass", 275, 189.5, "QB"), true);
  });

  it("rejects a catch total on the mean and keeps one 1.5 under it", () => {
    assert.equal(survivesShock("rec", 7.4, 6.5, "WR"), false);
    assert.equal(survivesShock("rec", 7.4, 4.5, "WR"), true);
  });

  it("rejects a receiving-yard line with less than a real cushion", () => {
    assert.equal(survivesShock("recyd", 100, 90.5, "WR"), false);
    assert.equal(survivesShock("recyd", 116, 64.5, "WR"), true);
  });

  it("will not build a slip out of the thin pass line", () => {
    const thin: NflQuote = {
      market: "pass",
      stat: "Pass Yards",
      line: 242.5,
      oddsType: "standard",
      projection: 275,
      cover: 0.68,
    };
    const floor: NflQuote = {
      market: "rec",
      stat: "Receptions",
      line: 4.5,
      oddsType: "standard",
      projection: 7.4,
      cover: 0.86,
    };
    const pick = (id: string, gameId: string, quotes: NflQuote[]): NflPick =>
      ({
        id,
        name: id,
        pos: "WR",
        espnId: null,
        team: "SEA",
        opp: "DEN",
        gameId,
        gameState: "pre",
        rank: 1,
        actual: null,
        quotes,
        lambda: 0.2,
        pTd: 0.18,
        lambdaFinish: 0.1,
        lambdaExplosive: 0.1,
        gravity: 0.4,
        rushShare: 0,
        tgtShare: 0.2,
        passShare: 0,
        expPassAtt: 0,
        expPassYd: 0,
        expPassTd: 0,
        expInt: 0,
        expRushAtt: 0,
        expRushYd: 0,
        expRushTd: 0,
        expTargets: 9,
        expRec: 7.4,
        expRecYd: 90,
        expRecTd: 0.2,
        expFantasy: 16,
        implied: 21,
        script: 0,
        fromBook: true,
        permPass: 1,
        permRush: 1,
        reasons: [],
      }) as NflPick;
    const slips = buildSlips(
      [pick("allen", "g1", [thin]), pick("jsn", "g2", [{ ...floor, projection: 7.4 }]), pick("kupp", "g3", [floor])],
      3,
    );
    const power = slips.find((slip) => slip.size === 2);
    assert.ok(power);
    assert.equal(power.skip, false);
    assert.ok(power.legs.every((leg) => leg.market === "rec" && leg.line === 4.5));
    assert.ok(power.legs.every((leg) => leg.name !== "allen"));
  });

  it("rejects a quarterback rush over that dies when the carries are cut", () => {
    assert.equal(survivesShock("rush", 67.7, 40.5, "QB"), false);
    assert.equal(survivesShock("rush", 67.7, 40.5, "RB"), true);
  });

  it("rejects unders inside one catch and keeps a catch of room", () => {
    assert.equal(survivesSpike("pass", 157, 211.5, "QB"), false);
    assert.equal(survivesSpike("rec", 3.6, 4.5, "RB"), false);
    assert.equal(survivesSpike("rec", 4.1, 5.5, "TE"), true);
    assert.equal(survivesSpike("rec", 3.2, 7.5, "RB"), true);
    assert.equal(survivesSpike("pass", 180, 260.5, "QB"), true);
  });
});
