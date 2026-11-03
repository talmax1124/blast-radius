import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { newNbaState, playNba, type NbaGameIn } from "./nba.ts";
import { newNflState, playNfl, type NflGameIn } from "./nfl.ts";
import { makeRng } from "./rng.ts";
import { simulateTicket } from "./ticket.ts";

const near = (a: number, b: number, tol: number) => assert.ok(Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`);

function moments(draw: () => number, n = 200_000): { mean: number; variance: number } {
  let s = 0;
  let s2 = 0;
  for (let i = 0; i < n; i++) {
    const v = draw();
    s += v;
    s2 += v * v;
  }
  const mean = s / n;
  return { mean, variance: s2 / n - mean * mean };
}

const nba: NbaGameIn = {
  home: "DEN",
  away: "POR",
  spread: -4.5,
  total: 230.5,
  players: [
    { name: "Star", team: "DEN", minutes: 35, pts: 27, reb: 11, ast: 9.5, threes: 1.8 },
    { name: "Guard", team: "DEN", minutes: 34, pts: 22, reb: 4.5, ast: 6, threes: 3.2 },
    { name: "Wing", team: "POR", minutes: 33, pts: 21, reb: 6.5, ast: 5.5, threes: 2 },
  ],
};

const nfl: NflGameIn = {
  home: "SEA",
  away: "CHI",
  spread: -3,
  total: 46.5,
  players: [
    { name: "QB", team: "CHI", pos: "QB", passAtt: 34, passYd: 245, passTd: 1.6, rushAtt: 5, rushYd: 22, rushTd: 0.2 },
    { name: "TE", team: "CHI", pos: "TE", targets: 8, rec: 6, recYd: 62, recTd: 0.4 },
    { name: "WR", team: "CHI", pos: "WR", targets: 7, rec: 4.5, recYd: 58, recTd: 0.35 },
    { name: "RB", team: "CHI", pos: "RB", rushAtt: 16, rushYd: 66, rushTd: 0.55, targets: 3, rec: 2.4, recYd: 18, recTd: 0.1 },
    { name: "SeaQB", team: "SEA", pos: "QB", passAtt: 32, passYd: 230, passTd: 1.5, rushAtt: 3, rushYd: 9 },
    { name: "SeaWR", team: "SEA", pos: "WR", targets: 10, rec: 7, recYd: 100, recTd: 0.5 },
  ],
};

describe("rng", () => {
  const rng = makeRng(11);
  it("draws gamma, poisson, binomial and negative binomial at their moments", () => {
    const g = moments(() => rng.gamma(4, 2.5));
    near(g.mean, 10, 0.1);
    near(g.variance, 25, 0.8);
    near(moments(() => rng.poisson(3.2)).mean, 3.2, 0.03);
    near(moments(() => rng.poisson(45)).mean, 45, 0.15);
    const b = moments(() => rng.binomial(40, 0.2));
    near(b.mean, 8, 0.05);
    near(b.variance, 6.4, 0.2);
    const nb = moments(() => rng.negBinomial(6, 4));
    near(nb.mean, 6, 0.05);
    near(nb.variance, 6 + 36 / 4, 0.4);
    near(moments(() => rng.lognormal(12, 0.9)).mean, 12, 0.15);
  });

  it("plays the same games from the same seed", () => {
    const a = makeRng(3);
    const b = makeRng(3);
    for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
  });
});

describe("nba game", () => {
  it("averages each player's projection", () => {
    const rng = makeRng(5);
    const st = newNbaState(nba);
    const sum = { pts: 0, reb: 0, ast: 0 };
    const n = 100_000;
    for (let k = 0; k < n; k++) {
      playNba(nba, rng, st);
      sum.pts += st.stat.pts[0];
      sum.reb += st.stat.reb[0];
      sum.ast += st.stat.ast[0];
    }
    // Blowout benching and short nights shave a little off the full-game projection.
    near(sum.pts / n, 27, 1.6);
    near(sum.reb / n, 11, 0.8);
    near(sum.ast / n, 9.5, 0.8);
  });

  it("prices the moneyline near the spread's implied chance and sits stars in blowouts", () => {
    const r = simulateTicket([{ sport: "nba", game: nba }], [{ kind: "moneyline", game: 0, team: "DEN" }], { sims: 100_000 });
    near(r.legs[0].sim, 0.64, 0.03);
    const blowout = simulateTicket(
      [{ sport: "nba", game: nba }],
      [
        { kind: "spread", game: 0, team: "DEN", line: -20 },
        { kind: "player", game: 0, player: "Star", stat: "pts", side: "over", line: 30.5 },
      ],
      { sims: 100_000 },
    );
    // Points overs on a favorite's star do worse when his team wins by 20: he sits the fourth quarter.
    assert.ok(blowout.legs[1].givenRest < blowout.legs[1].sim + 0.08);
  });
});

describe("nfl game", () => {
  it("ties a quarterback's yards to his receivers and his receivers to the score", () => {
    const r = simulateTicket(
      [{ sport: "nfl", game: nfl }],
      [
        { kind: "player", game: 0, player: "TE", stat: "recYd", side: "over", line: 55.5 },
        { kind: "player", game: 0, player: "QB", stat: "passYd", side: "over", line: 240.5 },
        { kind: "total", game: 0, side: "over", line: 46.5 },
      ],
      { sims: 100_000 },
    );
    assert.ok(r.lift > 1.15, `lift ${r.lift}`);
    assert.ok(r.joint > r.independent);
  });

  it("averages projected usage and hands out touchdowns that add up to the score", () => {
    const rng = makeRng(9);
    const st = newNflState(nfl);
    let rec = 0;
    let rushYd = 0;
    let tdRb = 0;
    const n = 100_000;
    for (let k = 0; k < n; k++) {
      playNfl(nfl, rng, st);
      rec += st.stat.rec[1];
      rushYd += st.stat.rushYd[3];
      tdRb += st.stat.rushTd[3] + st.stat.recTd[3] > 0 ? 1 : 0;
      const listed = st.stat.rushTd.reduce((a, b) => a + b, 0) + st.stat.recTd.reduce((a, b) => a + b, 0);
      assert.ok(listed * 6 <= st.homePts + st.awayPts + 6);
    }
    near(rec / n, 6, 0.7);
    near(rushYd / n, 66, 8);
    near(tdRb / n, 0.45, 0.12);
  });

  it("blends a priced leg toward its no-vig market and reports a fair price", () => {
    const r = simulateTicket(
      [{ sport: "nfl", game: nfl }],
      [{ kind: "player", game: 0, player: "TE", stat: "recYd", side: "over", line: 42.5, price: -114, opposite: -114 }],
      { sims: 50_000, offered: 100 },
    );
    const leg = r.legs[0];
    assert.ok(leg.blended != null && leg.blended < leg.sim && leg.blended > 0.5);
    assert.ok(r.fairAmerican < 0);
    assert.ok(r.evAtOffer != null);
  });
});

describe("spreads", () => {
  it("summarizes every player's replays and places a real result in them", async () => {
    const { simulateGame, percentileOf } = await import("./distribution.ts");
    const g = simulateGame({ sport: "nba", game: nba }, { sims: 40_000 });
    const star = g.players.find((p) => p.name === "Star");
    assert.ok(star);
    const pts = star.stats.pts;
    assert.ok(pts.q10 < pts.q50 && pts.q50 < pts.q90);
    near(pts.mean, 27, 1.6);
    assert.ok(percentileOf(pts, pts.q50) > 0.4 && percentileOf(pts, pts.q50) < 0.6);
    assert.ok(percentileOf(pts, 80) > 0.99);
    near(g.homeWin, 0.64, 0.03);
  });

  it("keeps sample games and a histogram for every leg", () => {
    const r = simulateTicket([{ sport: "nfl", game: nfl }], [{ kind: "player", game: 0, player: "TE", stat: "recYd", side: "over", line: 42.5 }], { sims: 5000 });
    assert.equal(r.samples.length, 12);
    assert.equal(r.legs[0].spread.n, 5000);
    assert.equal(r.samples[0].hits[0], r.samples[0].values[0] > 42.5);
  });
});
