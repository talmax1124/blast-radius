import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RZM,
  coverOver,
  emptyLine,
  finishGravity,
  impliedPoints,
  lognormalSurv,
  normCdf,
  permRatio,
  poissonGe,
  projectRoster,
  reseatAbsences,
  shrinkGravity,
  sigmoid,
  teamMass,
  type RosterPlayer,
  type WeekLine,
} from "./score.ts";

function line(over: Partial<WeekLine> = {}): WeekLine {
  return { ...emptyLine(), ...over };
}

function player(over: Partial<RosterPlayer> & Pick<RosterPlayer, "id" | "name" | "pos">): RosterPlayer {
  return {
    espnId: null,
    team: "BUF",
    opp: "MIA",
    line: line(),
    games: 2,
    injury: 1,
    ...over,
  };
}

describe("red-zone mass", () => {
  it("keeps the normal CDF centered", () => {
    assert.ok(Math.abs(normCdf(0) - 0.5) < 0.002);
    assert.ok(normCdf(2) > 0.97);
    assert.ok(normCdf(-2) < 0.03);
  });

  it("puts the lognormal median under the mean", () => {
    const atMean = lognormalSurv(230, RZM.cvPass, 230);
    assert.ok(atMean < 0.5);
    assert.ok(lognormalSurv(230, RZM.cvPass, 180) > atMean);
    assert.ok(lognormalSurv(230, RZM.cvPass, 280) < atMean);
  });

  it("scores a goal-line back as finish and a deep threat as explosive", () => {
    const hammer = shrinkGravity(finishGravity("RB", line({ rushAtt: 28, rushYd: 84, rushTd: 3 })), 28, "RB");
    const burner = shrinkGravity(
      finishGravity("WR", line({ tgt: 14, rec: 8, recYd: 176, recTd: 0 })),
      14,
      "WR",
    );
    assert.ok(hammer > 0.6, `hammer ${hammer}`);
    assert.ok(burner < 0.5, `burner ${burner}`);
    assert.ok(sigmoid(0) === 0.5);
  });

  it("gives a favorite more rush-TD mass than a dog", () => {
    const off = line({ passAtt: 60, passYd: 460, passTd: 3, rushAtt: 52, rushYd: 220, rushTd: 2 });
    const fav = teamMass(off, 1.62, 1, 1, 1, 1, { implied: 27.5, script: (27.5 - 22.5) / 6.5 });
    const dog = teamMass(off, 1.62, 1, 1, 1, 1, { implied: 17.5, script: (17.5 - 22.5) / 6.5 });
    assert.ok(fav.rushTd > dog.rushTd);
    assert.ok(fav.passTd > dog.passTd);
    assert.ok(fav.rushAtt > dog.rushAtt);
  });

  it("reads a book spread into the implied total", () => {
    const book = impliedPoints({
      spread: -7.5,
      total: 48.5,
      pointsFor: 40,
      games: 2,
      oppPointsAllowed: 30,
      oppGames: 2,
      home: true,
      neutral: false,
    });
    assert.equal(book.fromBook, true);
    assert.ok(Math.abs(book.implied - 28) < 0.05);
    const blind = impliedPoints({
      spread: null,
      total: null,
      pointsFor: 55,
      games: 2,
      oppPointsAllowed: 48,
      oppGames: 2,
      home: true,
      neutral: false,
    });
    assert.equal(blind.fromBook, false);
    assert.ok(blind.implied > 22);
  });

  it("caps a two-game defensive fluke", () => {
    const soft = permRatio(12, 1.62, RZM.leaguePassTd);
    assert.equal(soft, RZM.permHi);
    const stingy = permRatio(0, 1.62, RZM.leagueRushTd);
    assert.ok(stingy >= RZM.permLo);
    assert.ok(stingy < 1);
  });

  it("puts the bellcow ahead of the spare receiver", () => {
    const team = line({
      passAtt: 68,
      passYd: 490,
      passTd: 3,
      ints: 1,
      rushAtt: 54,
      rushYd: 230,
      rushTd: 2,
      tgt: 68,
      rec: 44,
      recYd: 490,
      recTd: 3,
    });
    const mass = teamMass(team, 1.62, 1.05, 1.08, 1.02, 1.04, { implied: 26, script: 0.5 });
    const scored = projectRoster(
      [
        player({
          id: "rb",
          name: "Bell Cow",
          pos: "RB",
          line: line({ rushAtt: 36, rushYd: 160, rushTd: 2, tgt: 8, rec: 6, recYd: 40, recTd: 0 }),
        }),
        player({
          id: "wr",
          name: "Spare",
          pos: "WR",
          line: line({ tgt: 5, rec: 3, recYd: 28, recTd: 0 }),
        }),
        player({
          id: "qb",
          name: "Starter",
          pos: "QB",
          line: line({ passAtt: 64, passYd: 470, passTd: 3, ints: 1, rushAtt: 10, rushYd: 48, rushTd: 1 }),
        }),
      ],
      team,
      mass,
      { team: "BUF", opp: "MIA", implied: 26, script: 0.5, fromBook: true },
    );
    const rb = scored.find((p) => p.id === "rb");
    const wr = scored.find((p) => p.id === "wr");
    const qb = scored.find((p) => p.id === "qb");
    assert.ok(rb && wr && qb);
    assert.ok(rb.pTd > wr.pTd);
    assert.ok(Math.abs(rb.pTd - (1 - Math.exp(-rb.lambda))) < 1e-9);
    assert.ok(rb.expRushYd > wr.expRushYd);
    assert.ok(qb.expPassYd > 180);
    assert.ok(rb.lambdaFinish + rb.lambdaExplosive <= rb.lambda + 1e-6);
    assert.ok(coverOver(rb.expRushYd, rb.expRushYd - 15, "yards", RZM.cvRush) > 0.55);
    assert.ok(poissonGe(5, 4.2) < poissonGe(4, 4.2));
  });

  it("moves a doubtful receiver's vacated yards to the healthy one", () => {
    const team = line({
      tgt: 20,
      rec: 12,
      recYd: 140,
      recTd: 1,
      passAtt: 30,
      passYd: 200,
      passTd: 1,
      rushAtt: 20,
      rushYd: 80,
      rushTd: 1,
    });
    const mass = teamMass(team, 1.62, 1, 1, 1, 1, { implied: 22.5, script: 0 });
    const scored = projectRoster(
      [
        player({
          id: "hurt",
          name: "Puka Nacua",
          pos: "WR",
          injury: 0.25,
          line: line({ tgt: 9, rec: 5, recYd: 74 }),
        }),
        player({
          id: "well",
          name: "Davante Adams",
          pos: "WR",
          injury: 1,
          line: line({ tgt: 16, rec: 11, recYd: 221, recTd: 2 }),
        }),
      ],
      team,
      mass,
      { team: "LAR", opp: "DEN", implied: 23, script: 0.1, fromBook: true },
    );
    const well = scored.find((p) => p.id === "well");
    const hurt = scored.find((p) => p.id === "hurt");
    assert.ok(well && hurt);
    const next = reseatAbsences(
      scored,
      new Map([
        ["hurt", 0.25],
        ["well", 1],
      ]),
    );
    const after = next.find((p) => p.id === "well");
    assert.ok(after);
    const moved = hurt.expRecYd * ((1 - 0.25) / 0.25);
    assert.ok(Math.abs(after.expRecYd - (well.expRecYd + moved)) < 1e-6);
    assert.ok(after.reasons.some((r) => r.includes("Nacua")));
    assert.equal(next.find((p) => p.id === "hurt")?.expRecYd, hurt.expRecYd);
  });

  it("zeros a player who is out", () => {
    const team = line({
      rushAtt: 40,
      rushYd: 160,
      rushTd: 2,
      tgt: 40,
      rec: 26,
      recYd: 280,
      recTd: 2,
      passAtt: 40,
      passYd: 280,
      passTd: 2,
    });
    const mass = teamMass(team, 1.62, 1, 1, 1, 1, { implied: 22.5, script: 0 });
    const [out] = projectRoster(
      [
        player({
          id: "out",
          name: "Out",
          pos: "RB",
          injury: 0,
          line: line({ rushAtt: 30, rushYd: 140, rushTd: 2 }),
        }),
      ],
      team,
      mass,
      { team: "BUF", opp: "MIA", implied: 22.5, script: 0, fromBook: false },
    );
    assert.ok(out);
    assert.equal(out.lambda, 0);
    assert.equal(out.expRushYd, 0);
  });
});
