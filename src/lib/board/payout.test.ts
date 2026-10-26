import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSlips, legFloor, takeLegs } from "./compose.ts";
import { calibrate, fitTrust } from "./grade.ts";
import { breakevenLeg, hitDistribution, priceSlip, slipReturn } from "./payout.ts";
import type { BoardLeg, LedgerLeg } from "./types.ts";

function leg(id: string, gameId: string, p: number, extra: Partial<BoardLeg> = {}): BoardLeg {
  return {
    id,
    sport: "nhl",
    date: "2026-10-26",
    gameId,
    game: gameId,
    playerId: id,
    name: id,
    team: "X",
    market: "sog15",
    marketLabel: "Shots 1.5",
    prop: "Over 1.5",
    p,
    note: "",
    settled: null,
    ...extra,
  };
}

describe("payout", () => {
  it("sums the hit distribution to one", () => {
    const dist = hitDistribution([0.6, 0.7, 0.8]);
    assert.equal(dist.length, 4);
    assert.ok(Math.abs(dist.reduce((s, x) => s + x, 0) - 1) < 1e-12);
    assert.ok(Math.abs(dist[3] - 0.336) < 1e-12);
  });

  it("finds the 6-power break-even at the 37.5x root", () => {
    const be = breakevenLeg(6, "power") ?? 0;
    assert.ok(Math.abs(be - 37.5 ** (-1 / 6)) < 1e-6);
    assert.ok(Math.abs((slipReturn(new Array(6).fill(be), "power") ?? 0) - 1) < 1e-6);
  });

  it("passes a card whose edge dies under a 3-point cut", () => {
    const thin = priceSlip(new Array(6).fill(0.56));
    assert.equal(thin.play, "pass");
    const real = priceSlip(new Array(6).fill(0.66));
    assert.notEqual(real.play, "pass");
    assert.ok((real.stressed ?? 0) > 1);
  });

  it("raises the leg floor on short cards", () => {
    assert.ok(legFloor(2) > legFloor(6));
    assert.ok(legFloor(6) >= 0.56);
  });
});

describe("calibration", () => {
  it("keeps the prior with no ledger and never trusts above face value", () => {
    assert.equal(fitTrust([], 0.85), 0.85);
    const hot: LedgerLeg[] = Array.from({ length: 40 }, (_, i) => ({
      id: String(i), date: "d", sport: "nba", market: "pts", marketLabel: "Pts", name: "A", prop: "o", p: 0.7, result: "hit",
    }));
    assert.ok(fitTrust(hot, 0.85) <= 1);
  });

  it("cools an overconfident sport toward a coin flip", () => {
    const cold: LedgerLeg[] = Array.from({ length: 40 }, (_, i) => ({
      id: String(i), date: "d", sport: "nba", market: "pts", marketLabel: "Pts", name: "A", prop: "o", p: 0.75, result: i % 2 ? "hit" : "miss",
    }));
    assert.ok(fitTrust(cold, 0.85) < 0.85);
    const p = calibrate(leg("a", "g", 0.75, { sport: "nba", market: "pts" }), cold);
    assert.ok(p < 0.7 && p > 0.5);
  });

  it("leaves a de-vigged moneyline at the market number", () => {
    const p = calibrate(leg("a", "g", 0.7, { sport: "nba", market: "ml" }), []);
    assert.ok(Math.abs(p - 0.7) < 1e-9);
  });
});

describe("composer", () => {
  it("caps one sport at half of an all-sports mix", () => {
    const pool = [
      ...Array.from({ length: 6 }, (_, i) => leg(`h${i}`, `n${i}`, 0.8 - i * 0.01)),
      ...Array.from({ length: 3 }, (_, i) => leg(`b${i}`, `b${i}`, 0.7, { sport: "nba", market: `m${i}` })),
    ];
    const mix = takeLegs(pool, 6, true);
    assert.ok(mix);
    assert.equal(mix.filter((l) => l.sport === "nhl").length, 3);
  });

  it("prices every slip it builds", () => {
    const pool = Array.from({ length: 6 }, (_, i) => leg(`p${i}`, `g${i}`, 0.7));
    const six = buildSlips(pool, "nhl").find((s) => s.size === 6 && s.kind === "power");
    assert.ok(six);
    assert.ok(six.power != null && six.flex != null);
    assert.equal(six.dist.length, 7);
  });
});
