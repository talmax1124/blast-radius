import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nhlGame, nhlLine } from "./adapters.ts";
import { centerOnLines } from "./anchor.ts";
import { consensus } from "./consensus.ts";
import { simulateGame } from "./distribution.ts";
import type { NbaGameIn } from "./nba.ts";
import { newNhlState, playNhl, type NhlGameIn, type NhlPlayerIn } from "./nhl.ts";
import { makeRng } from "./rng.ts";
import { simulateTicket, type Leg } from "./ticket.ts";

const near = (a: number, b: number, tol: number, what = "") => assert.ok(Math.abs(a - b) <= tol, `${what} ${a} not within ${tol} of ${b}`);

/** Letters, not digits, tell the test skaters apart: normName (how lines find players) drops digits. */
const L = "ABCDEFGHIJKL";

/** A dressed lineup: 12 forwards, 6 defense and two goalies, with rates shaped like a real top-to-bottom roster. */
function roster(team: string, scale = 1): NhlPlayerIn[] {
  const fSog = [3.4, 2.9, 2.6, 2.4, 2.2, 2, 1.8, 1.6, 1.4, 1.2, 1, 0.9];
  const fG = [0.45, 0.38, 0.32, 0.28, 0.24, 0.2, 0.17, 0.14, 0.11, 0.09, 0.07, 0.06];
  const fA = [0.6, 0.5, 0.42, 0.36, 0.3, 0.25, 0.21, 0.18, 0.15, 0.12, 0.1, 0.08];
  const dSog = [2.4, 2, 1.7, 1.4, 1.2, 1];
  const dG = [0.1, 0.08, 0.06, 0.05, 0.04, 0.03];
  const dA = [0.45, 0.35, 0.28, 0.2, 0.16, 0.12];
  return [
    ...fSog.map((sog, k) => ({ name: `${team} F${L[k]}`, team, pos: "F" as const, sog, goals: fG[k] * scale, assists: fA[k] * scale, blocks: 0.5 })),
    ...dSog.map((sog, k) => ({ name: `${team} D${L[k]}`, team, pos: "D" as const, sog, goals: dG[k] * scale, assists: dA[k] * scale, blocks: 1.6 })),
    { name: `${team} GA`, team, pos: "G", sog: 0, goals: 0, assists: 0 },
    { name: `${team} GB`, team, pos: "G", sog: 0, goals: 0, assists: 0 },
  ];
}

const even: NhlGameIn = { home: "COL", away: "DAL", spread: 0, total: 6.1, players: [...roster("COL"), ...roster("DAL")] };
const fav: NhlGameIn = { home: "COL", away: "DAL", spread: -0.6, total: 6.3, players: [...roster("COL"), ...roster("DAL")] };

describe("nhl game", () => {
  it("plays a league-average night: 6.1 goals, 29 shots a team, a .903 save percentage, 23% past regulation", () => {
    const rng = makeRng(21);
    const st = newNhlState(even);
    const n = 20_000;
    let goals = 0;
    let shots = 0;
    let saves = 0;
    let onGoalie = 0;
    let ot = 0;
    let en = 0;
    let shootout = 0;
    for (let k = 0; k < n; k++) {
      playNhl(even, rng, st);
      goals += st.homePts + st.awayPts;
      shots += st.homeShots + st.awayShots;
      for (const v of st.stat.saves) saves += v;
      onGoalie += st.homePts - st.homeSo - st.homeEn + st.awayPts - st.awaySo - st.awayEn;
      ot += st.ending > 0 ? 1 : 0;
      shootout += st.ending === 2 ? 1 : 0;
      en += st.homeEn + st.awayEn;
    }
    const sv = saves / (saves + onGoalie);
    console.log(`  calibration: ${(goals / n).toFixed(2)} goals, ${(shots / n / 2).toFixed(1)} shots/team, sv% ${sv.toFixed(4)}, OT ${(ot / n).toFixed(3)} (shootout ${(shootout / n).toFixed(3)}), EN ${(en / n).toFixed(2)}`);
    near(goals / n, 6.1, 0.1, "goals");
    near(shots / n / 2, 29.3, 0.8, "shots per team");
    near(sv, 0.903, 0.004, "save pct");
    near(ot / n, 0.23, 0.025, "overtime rate");
    assert.ok(shootout / n > 0.06 && shootout / n < 0.14, `shootout rate ${shootout / n}`);
    assert.ok(en / n > 0.2 && en / n < 0.45, `empty-net goals ${en / n}`);
  });

  it("adds up: skater goals are team goals, saves are the other side's shots less its goals", () => {
    // Listed goal rates above the team's expected goals, so every goal lands on a listed skater.
    const full: NhlGameIn = { ...fav, players: [...roster("COL", 1.3), ...roster("DAL", 1.3)] };
    const rng = makeRng(4);
    const st = newNhlState(full);
    for (let k = 0; k < 20_000; k++) {
      playNhl(full, rng, st);
      for (const [team, pts, so, shots, oppShots, oppPts, oppSo] of [
        ["COL", st.homePts, st.homeSo, st.homeShots, st.awayShots, st.awayPts, st.awaySo],
        ["DAL", st.awayPts, st.awaySo, st.awayShots, st.homeShots, st.homePts, st.homeSo],
      ] as const) {
        let g = 0;
        let a = 0;
        let starter = -1;
        full.players.forEach((p, i) => {
          if (p.team !== team) return;
          if (p.pos === "G") {
            if (starter < 0) starter = i;
            else assert.equal(st.stat.saves[i], 0, "backup goalie records nothing");
            return;
          }
          g += st.stat.goals[i];
          a += st.stat.assists[i];
          assert.ok(st.stat.sog[i] >= st.stat.goals[i], "every goal is a shot on goal");
          assert.equal(st.stat.points[i], st.stat.goals[i] + st.stat.assists[i]);
        });
        // The shootout winner's goal counts in the score but is credited to nobody.
        assert.equal(g, pts - so, `${team} skater goals`);
        assert.ok(a <= 2 * g, "at most two assists a goal");
        assert.equal(st.stat.saves[starter], oppShots - (oppPts - oppSo), `${team} starter saves`);
        assert.ok(shots >= pts - so);
      }
      assert.notEqual(st.homePts, st.awayPts, "no ties: overtime or a shootout decides it");
    }
  });

  it("hands each skater back his own projection", () => {
    // Listed rates below the team's expected goals: the rest goes to teammates not listed, and the star keeps his.
    const rng = makeRng(5);
    const st = newNhlState(fav);
    const n = 30_000;
    const sum = { sog: 0, goals: 0, assists: 0, blocks: 0 };
    for (let k = 0; k < n; k++) {
      playNhl(fav, rng, st);
      sum.sog += st.stat.sog[0];
      sum.goals += st.stat.goals[0];
      sum.assists += st.stat.assists[0];
      sum.blocks += st.stat.blocks[12];
    }
    near(sum.sog / n, 3.4, 0.08, "star sog");
    near(sum.goals / n, 0.45, 0.025, "star goals");
    near(sum.assists / n, 0.6, 0.03, "star assists");
    near(sum.blocks / n, 1.6, 0.08, "defenseman blocks");
  });

  it("gives skater shots a realistic, overdispersed spread", () => {
    const rng = makeRng(6);
    const st = newNhlState(even);
    const n = 30_000;
    let s = 0;
    let s2 = 0;
    for (let k = 0; k < n; k++) {
      playNhl(even, rng, st);
      s += st.stat.sog[0];
      s2 += st.stat.sog[0] ** 2;
    }
    const mean = s / n;
    const ratio = (s2 / n - mean * mean) / mean;
    assert.ok(ratio > 1.15 && ratio < 1.7, `variance/mean ${ratio}`);
  });

  it("moves a skater's own legs when his own input moves", () => {
    const leg = (stat: "sog" | "goals", line: number): Leg[] => [{ kind: "player", game: 0, player: "COL FD", stat, side: "over", line }];
    const withSog = (v: number): NhlGameIn => ({ ...even, players: even.players.map((p) => (p.name === "COL FD" ? { ...p, sog: v } : p)) });
    const withGoals = (v: number): NhlGameIn => ({ ...even, players: even.players.map((p) => (p.name === "COL FD" ? { ...p, goals: v } : p)) });
    const at = (g: NhlGameIn, l: Leg[]) => simulateTicket([{ sport: "nhl", game: g }], l, { sims: 30_000, seed: 3 }).legs[0];
    const low = at(withSog(2.4), leg("sog", 2.5));
    const high = at(withSog(3.12), leg("sog", 2.5));
    assert.ok(high.sim - low.sim > 0.12, `P(over 2.5 sog) ${low.sim} -> ${high.sim}`);
    // Proportional: 30% more input is about 30% more mean, not renormalized away by the team.
    near(high.mean! / low.mean!, 1.3, 0.05, "sog mean ratio");
    const g1 = at(withGoals(0.28), leg("goals", 0.5));
    const g2 = at(withGoals(0.42), leg("goals", 0.5));
    assert.ok(g2.sim - g1.sim > 0.08, `P(goal) ${g1.sim} -> ${g2.sim}`);
    near(g2.mean! / g1.mean!, 1.5, 0.12, "goals mean ratio");
  });

  it("ties a team's goals to its scorers and its shots to the other goalie's saves", () => {
    const r = simulateTicket(
      [{ sport: "nhl", game: fav }],
      [
        { kind: "teamTotal", game: 0, team: "COL", side: "over", line: 3.5 },
        { kind: "player", game: 0, player: "COL FA", stat: "points", side: "over", line: 0.5 },
        { kind: "player", game: 0, player: "COL FB", stat: "points", side: "over", line: 0.5 },
      ],
      { sims: 30_000 },
    );
    assert.ok(r.lift > 1.2, `lift ${r.lift}`);
    const s = simulateTicket(
      [{ sport: "nhl", game: fav }],
      [
        { kind: "player", game: 0, player: "COL FA", stat: "sog", side: "over", line: 3.5 },
        { kind: "player", game: 0, player: "DAL GA", stat: "saves", side: "over", line: 26.5 },
      ],
      { sims: 30_000 },
    );
    assert.ok(s.lift > 1.03, `shots/saves lift ${s.lift}`);
    assert.ok(s.legs[1].mean! > 24 && s.legs[1].mean! < 30, `saves mean ${s.legs[1].mean}`);
  });

  it("prices both moneylines and both puck lines to 1, and makes the favorite the favorite", () => {
    const r = simulateTicket(
      [{ sport: "nhl", game: fav }],
      [
        { kind: "moneyline", game: 0, team: "COL" },
        { kind: "moneyline", game: 0, team: "DAL" },
        { kind: "spread", game: 0, team: "COL", line: -1.5 },
        { kind: "spread", game: 0, team: "DAL", line: 1.5 },
        { kind: "total", game: 0, side: "over", line: 6.5 },
        { kind: "total", game: 0, side: "under", line: 6.5 },
      ],
      { sims: 20_000 },
    );
    const [ml1, ml2, pl1, pl2, o, u] = r.legs.map((l) => l.sim);
    near(ml1 + ml2, 1, 1e-12, "moneylines");
    near(pl1 + pl2, 1, 1e-12, "puck lines");
    near(o + u, 1, 1e-12, "total");
    assert.ok(ml1 > 0.58 && ml1 < 0.67, `favorite ${ml1}`);
    assert.ok(pl1 > 0.25 && pl1 < 0.4, `favorite -1.5 ${pl1}`);
    near(r.legs[4].mean!, 6.3, 0.1, "total mean");
  });

  it("centers a skater's shots, a goalie's saves and a points line on the book", () => {
    const run = (g: NhlGameIn, legs: { player: string; stat: string; line: number }[]) =>
      simulateTicket(
        [{ sport: "nhl", game: g }],
        legs.map((l) => ({ kind: "player", game: 0, player: l.player, stat: l.stat as "sog", side: "over", line: l.line })),
        { sims: 30_000, seed: 11 },
      ).legs.map((l) => l.sim);
    const lines = [
      { name: "COL FF", stat: "sog", line: 3.5 },
      { name: "DAL GA", stat: "saves", line: 24.5 },
      { name: "COL FA", stat: "points", line: 0.5 },
      { name: "DAL FA", stat: "goals", line: 0.5, target: 0.4 },
    ];
    const before = run(even, lines.map((l) => ({ player: l.name, stat: l.stat, line: l.line })));
    const centered = centerOnLines(even, lines, run);
    const after = run(centered, lines.map((l) => ({ player: l.name, stat: l.stat, line: l.line })));
    console.log(`  centerOnLines: ${lines.map((l, k) => `${l.name} ${l.stat} ${before[k].toFixed(3)} -> ${after[k].toFixed(3)}`).join("; ")}`);
    near(after[0], 0.5, 0.03, "sog");
    near(after[1], 0.5, 0.03, "saves");
    near(after[2], 0.5, 0.03, "points");
    near(after[3], 0.4, 0.03, "goals to its no-vig target");
    const star = centered.players.find((p) => p.name === "COL FA")!;
    // The points line has no goals or assists line beside it, so both moved by the same factor.
    near(star.goals / 0.45, star.assists / 0.6, 1e-9, "goals and assists move together");
  });
});

describe("nhl in the rest of the sim", () => {
  const nba: NbaGameIn = { home: "DEN", away: "POR", spread: -4.5, total: 230.5, players: [{ name: "Star", team: "DEN", minutes: 35, pts: 27, reb: 11, ast: 9.5, threes: 1.8 }] };

  it("prices a ticket across NBA and NHL games and runs consensus with a second seed", () => {
    const games = [
      { sport: "nba" as const, game: nba },
      { sport: "nhl" as const, game: fav },
    ];
    const legs: Leg[] = [
      { kind: "player", game: 0, player: "Star", stat: "pts", side: "over", line: 25.5 },
      { kind: "player", game: 1, player: "COL FA", stat: "sog", side: "over", line: 2.5 },
      { kind: "moneyline", game: 1, team: "COL" },
    ];
    const r = simulateTicket(games, legs, { sims: 10_000 });
    assert.equal(r.legs.length, 3);
    assert.ok(r.joint > 0 && r.joint < r.legs[1].sim);
    const c = consensus([{ sport: "nhl", game: fav }], legs.slice(1).map((l) => ({ ...l, game: 0 })), { fastSims: 20_000, pbpSims: 20_000 });
    assert.equal(c.legs.length, 2);
    assert.ok(c.legs.every((l) => l.agree), "same engine, two seeds: only noise apart");
    assert.ok(c.fast.legs[0].sim !== c.pbp.legs[0].sim, "the second run is a different sample");
    assert.equal(c.notes.length, 1);
  });

  it("summarizes an NHL game's spread of outcomes", () => {
    const g = simulateGame({ sport: "nhl", game: fav }, { sims: 10_000 });
    const star = g.players.find((p) => p.name === "COL FA")!;
    assert.ok(star.stats.sog.q10 <= star.stats.sog.q50 && star.stats.sog.q50 <= star.stats.sog.q90);
    assert.ok(g.homeWin > 0.55);
    const goalie = g.players.find((p) => p.name === "DAL GA")!;
    assert.ok(goalie.stats.saves.mean > 20);
  });

  it("builds a game from ICE board rows and reads the margin off the moneyline", () => {
    const board = [
      { name: "Nathan MacKinnon", team: "COL", pos: "C", lambdaSog: 4.2, lambdaPts: 1.45, shPct: 0.12, gp: 15 },
      { name: "Cale Makar", team: "COL", pos: "D", lambdaSog: 3.1, lambdaPts: 1.2, shPct: 0.07, gp: 15 },
      { name: "Jason Robertson", team: "DAL", pos: "LW", lambdaSog: 3.0, lambdaPts: 1.0, shPct: 0.14, gp: 15 },
      { name: "Elsewhere", team: "NYR", pos: "C", lambdaSog: 3, lambdaPts: 1, shPct: 0.1, gp: 15 },
    ];
    const line = nhlLine({ home: "COL", away: "DAL", total: 6.5, homeMl: "-150", awayMl: "+130", goalies: [{ name: "Mackenzie Blackwood", team: "COL" }, { name: "Scott Wedgewood", team: "COL" }, { name: "Jake Oettinger", team: "DAL" }] });
    assert.ok(line.spread < 0, "home favorite lays goals");
    const g = nhlGame(board, line, { starters: { COL: "Scott Wedgewood" } });
    assert.equal(g.players.filter((p) => p.pos !== "G").length, 3);
    const mac = g.players.find((p) => p.name === "Nathan MacKinnon")!;
    near(mac.goals, 4.2 * 0.12, 1e-9);
    near(mac.assists, 1.45 - 4.2 * 0.12, 1e-9);
    assert.equal(g.players.find((p) => p.name === "Cale Makar")!.pos, "D");
    assert.equal(g.players.find((p) => p.pos === "G" && p.team === "COL")!.name, "Scott Wedgewood", "named starter goes first");
    const r = simulateTicket([{ sport: "nhl", game: g }], [{ kind: "moneyline", game: 0, team: "COL" }], { sims: 20_000 });
    const noVig = (150 / 250) / (150 / 250 + 100 / 230);
    near(r.legs[0].sim, noVig, 0.025, "moneyline round trip");
  });
});
