import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkNbaRoster, checkNflRoster, needsReview, normName, parseStatus, type DepthRow } from "./roster.ts";
import { applyNflWeather, nflWeatherEffect } from "./weather.ts";
import { blendMarket } from "../board/grade.ts";
import { score, scorecard } from "./score.ts";
import type { NflGameIn } from "./nfl.ts";

const sea: NflGameIn = {
  home: "SEA",
  away: "CHI",
  spread: -3,
  total: 46.5,
  players: [
    { name: "Emanuel Wilson", team: "SEA", pos: "RB", rushAtt: 18.8, rushYd: 66, rushTd: 0.4, targets: 2, rec: 1.6, recYd: 10, recTd: 0.05 },
    { name: "Jaxon Smith-Njigba", team: "SEA", pos: "WR", targets: 9, rec: 6.5, recYd: 85, recTd: 0.5 },
    { name: "D'Andre Swift", team: "CHI", pos: "RB", rushAtt: 17.7, rushYd: 65.6, rushTd: 0.46, targets: 4.6, rec: 3.4, recYd: 33, recTd: 0.14 },
  ],
};
const depth: DepthRow[] = [
  { team: "SEA", pos: "RB", rank: 1, name: "Zach Charbonnet", status: "active" },
  { team: "SEA", pos: "RB", rank: 2, name: "Jadarian Price", status: "active" },
  { team: "SEA", pos: "RB", rank: 3, name: "Emanuel Wilson", status: "active" },
];

describe("roster check", () => {
  it("rebuilds a stale backfield from the depth chart and keeps the group's volume", () => {
    const { game, changes } = checkNflRoster(sea, depth);
    const att = (n: string) => game.players.find((p) => p.name === n)?.rushAtt ?? 0;
    assert.ok(att("Zach Charbonnet") > att("Jadarian Price") && att("Jadarian Price") > att("Emanuel Wilson"));
    const total = ["Zach Charbonnet", "Jadarian Price", "Emanuel Wilson"].reduce((s, n) => s + att(n), 0);
    assert.ok(Math.abs(total - 18.8) < 1e-9);
    assert.deepEqual(needsReview(changes).map((c) => c.name).sort(), ["Jadarian Price", "Zach Charbonnet"]);
    // Groups the chart does not cover stay as they were.
    assert.equal(game.players.find((p) => p.name === "D'Andre Swift")?.rushAtt, 17.7);
  });

  it("drops a player ruled out and hands his volume to the backs left", () => {
    const both: NflGameIn = { ...sea, players: [...sea.players, { name: "Zach Charbonnet", team: "SEA", pos: "RB", rushAtt: 10, rushYd: 40 }] };
    const { game } = checkNflRoster(both, depth, [{ team: "SEA", name: "Emanuel Wilson", status: "out" }]);
    assert.equal(game.players.some((p) => p.name === "Emanuel Wilson"), false);
    const rb = game.players.filter((p) => p.team === "SEA" && p.pos === "RB").reduce((s, p) => s + (p.rushAtt ?? 0), 0);
    assert.ok(Math.abs(rb - 28.8) < 1e-9);
  });

  it("hands an NBA scratch's minutes to teammates and flags missing rotation players", () => {
    const nba = {
      home: "GS",
      away: "PHX",
      spread: -4,
      total: 228,
      players: [
        { name: "Jimmy Butler III", team: "GS", minutes: 32, pts: 20, reb: 5, ast: 5, threes: 1 },
        { name: "Brandin Podziemski", team: "GS", minutes: 28, pts: 12, reb: 5, ast: 3, threes: 1.5 },
      ],
    };
    const { game, changes } = checkNbaRoster(nba, [{ team: "GS", name: "Jimmy Butler", status: "out" }], [{ team: "GS", name: "Stephen Curry", minutes: 31 }]);
    assert.equal(game.players.length, 1);
    assert.ok(game.players[0].minutes > 28);
    assert.ok(changes.some((c) => c.kind === "missing" && c.name === "Stephen Curry"));
  });

  it("matches names across suffixes and accents and reads ESPN statuses", () => {
    assert.equal(normName("Jimmy Butler III"), normName("Jimmy Butler"));
    assert.equal(normName("Nikola Jokić"), normName("Nikola Jokic"));
    assert.equal(parseStatus("Injured Reserve"), "out");
    assert.equal(parseStatus("Questionable"), "questionable");
    assert.equal(parseStatus("Active"), "active");
  });
});

describe("weather", () => {
  it("leaves indoor and calm games alone", () => {
    assert.equal(nflWeatherEffect({ dome: true, tempF: 10, windMph: 30, precipIn: 0.3 }).totalPts, 0);
    assert.equal(nflWeatherEffect({ dome: false, tempF: 60, windMph: 6, precipIn: 0 }).pass, 1);
  });

  it("cuts passing and the total in wind, and moves volume to the run", () => {
    const e = nflWeatherEffect({ dome: false, tempF: 40, windMph: 22, precipIn: 0.12 });
    assert.ok(e.pass < 0.85 && e.pass >= 0.72);
    assert.ok(e.totalPts < -4 && e.totalPts >= -9);
    const g = applyNflWeather(sea, e);
    assert.ok(g.total < sea.total);
    const jsn = g.players.find((p) => p.name === "Jaxon Smith-Njigba")!;
    assert.ok(jsn.recYd! < 85 && jsn.targets! > 9 * e.pass);
    assert.ok(g.players.find((p) => p.name === "D'Andre Swift")!.rushAtt! > 17.7);
  });
});

describe("market anchor and scorecard", () => {
  it("gives the model less room the further it sits from the book", () => {
    const near = blendMarket(0.6, 0.55) - 0.55;
    const far = blendMarket(0.85, 0.55) - 0.55;
    assert.ok(near > 0 && far > 0);
    assert.ok(far < 0.06, `far gap moved ${far}`);
  });

  it("scores a coin flip at 0.25 Brier and ranks a sharper forecast better", () => {
    assert.ok(Math.abs(score([0.5, 0.5], [1, 0]).brier - 0.25) < 1e-12);
    const c = scorecard([
      { sport: "nba", market: "nba points", p: 0.8, result: "hit", price: -150, opposite: 120 },
      { sport: "nba", market: "nba points", p: 0.8, result: "miss", price: -150, opposite: 120 },
    ]);
    assert.equal(c.n, 2);
    assert.equal(c.priced?.n, 2);
    assert.ok(c.priced!.market.brier < c.priced!.model.brier);
  });
});

describe("engine consensus and backup quarterbacks", () => {
  it("flags legs the two engines disagree on by more than ten points", async () => {
    const { classify, CONSENSUS_GAP } = await import("./consensus.ts");
    const rows = classify([0.555, 0.571, 0.894], [0.288, 0.52, 0.85], ["Maxey o25.5", "Brown o3.5 ast", "Spurs ML"]);
    assert.equal(CONSENSUS_GAP, 0.1);
    assert.deepEqual(rows.map((r) => r.agree), [false, true, true]);
    assert.ok(Math.abs(rows[0].mean - 0.4215) < 1e-9);
  });

  it("reads the quarterback's share of team passes and cuts an emergency starter's passing game", async () => {
    const { qbLevel, applyQbDowngrade } = await import("./roster.ts");
    assert.equal(qbLevel(0.92), "starter");
    assert.equal(qbLevel(0.3), "backup");
    assert.equal(qbLevel(0.09), "emergency");
    const game: NflGameIn = {
      home: "BAL", away: "JAX", spread: 10, total: 39.5,
      players: [
        { name: "Joe Fagnano", team: "BAL", pos: "QB", passAtt: 27, passYd: 165, passTd: 0.75 },
        { name: "Rashod Bateman", team: "BAL", pos: "WR", targets: 3.5, rec: 2.1, recYd: 28, recTd: 0.09 },
        { name: "Trevor Lawrence", team: "JAX", pos: "QB", passAtt: 29, passYd: 238, passTd: 1.6 },
      ],
    };
    const d = applyQbDowngrade(game, "BAL", "emergency");
    const by = (n: string) => d.game.players.find((p) => p.name === n)!;
    assert.ok(by("Joe Fagnano").passYd! < 120 && by("Joe Fagnano").passAtt === 27);
    assert.ok(by("Rashod Bateman").recYd! < 20 && by("Rashod Bateman").targets === 3.5);
    assert.equal(by("Trevor Lawrence").passYd, 238);
    assert.equal(applyQbDowngrade(game, "JAX", "starter").change, null);
  });

  it("fits a roster's overflowing minutes into 240 from the deep bench first", async () => {
    const { fitMinutes } = await import("./nba-pbp.ts");
    const mins = [36, 35, 29, 28, 28, 25, 24, 24, 21, 21, 21, 21, 19];
    const list = mins.map((m, i) => ({ name: `P${i}`, team: "LAL", minutes: m, pts: m * 0.5, reb: 3, ast: 2, threes: 1 }));
    const fit = fitMinutes(list, ["LAL"]);
    assert.ok(Math.abs(fit.reduce((s, p) => s + p.minutes, 0) - 240) < 1e-6);
    assert.equal(fit[0].minutes, 36);
    assert.equal(fit[0].pts, 18);
    assert.ok(fit[12].minutes < 19);
  });
});
