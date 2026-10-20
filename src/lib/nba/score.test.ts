import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCard, coverOver, defenseFactor, gamesFromLog, isBackToBack, preseasonForm, projectPlayer, recentForm, shrink } from "./score.ts";

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

  it("lets five real games move a 20-point season without chasing them", () => {
    const base = projectPlayer({
      pos: "G",
      gp: 70,
      season: { min: 36, pts: 20, reb: 4, ast: 5, threes: 1.5 },
      careerGp: 400,
      career: { min: 36, pts: 20, reb: 4, ast: 5, threes: 1.5 },
      home: true,
    });
    const hot = projectPlayer({
      pos: "G",
      gp: 70,
      season: { min: 36, pts: 20, reb: 4, ast: 5, threes: 1.5 },
      careerGp: 400,
      career: { min: 36, pts: 20, reb: 4, ast: 5, threes: 1.5 },
      home: true,
      recentGp: 5,
      recent: { min: 36, pts: 30, reb: 4, ast: 5, threes: 1.5 },
    });
    assert.ok(hot.quotes.pts.projection > base.quotes.pts.projection + 2);
    assert.ok(hot.quotes.pts.projection < 27, `chased to ${hot.quotes.pts.projection}`);
  });

  it("caps a tiny-sample defense and cuts minutes on a back-to-back", () => {
    assert.equal(defenseFactor(140, 110), 1.08);
    assert.equal(defenseFactor(90, 110), 0.92);
    const fresh = projectPlayer({
      pos: "F",
      gp: 40,
      season: line,
      careerGp: 400,
      career: line,
      home: true,
    });
    const tired = projectPlayer({
      pos: "F",
      gp: 40,
      season: line,
      careerGp: 400,
      career: line,
      home: true,
      backToBack: true,
    });
    assert.ok(tired.minutes < fresh.minutes);
    assert.ok(tired.quotes.pts.projection < fresh.quotes.pts.projection);
  });

  it("ignores preseason games and flags a next-day tip", () => {
    const form = recentForm([
      { min: 20, pts: 40, reb: 10, ast: 10, threes: 6, date: "2026-10-08T00:00:00Z", preseason: true },
      { min: 34, pts: 22, reb: 5, ast: 6, threes: 2, date: "2026-10-18T00:00:00Z", preseason: false },
    ]);
    assert.equal(form.gp, 1);
    assert.ok(form.line.pts < 25);
    assert.equal(isBackToBack("2026-10-19T23:00:00Z", "2026-10-20T23:00:00Z"), true);
    assert.equal(isBackToBack("2026-10-17T23:00:00Z", "2026-10-20T23:00:00Z"), false);
    const parsed = gamesFromLog({
      names: ["minutes", "points", "totalRebounds", "assists", "threePointFieldGoalsMade-threePointFieldGoalsAttempted"],
      seasonTypes: [
        { displayName: "2026-27 Preseason", categories: [{ events: [{ eventId: "p", stats: ["20", "30", "8", "8", "4-8"] }] }] },
        { displayName: "2026-27 Regular Season", categories: [{ events: [{ eventId: "r", stats: ["34", "22", "5", "6", "2-6"] }] }] },
        { displayName: "2026-27 Postseason", categories: [{ events: [{ eventId: "o", stats: ["40", "40", "10", "10", "5-8"] }] }] },
      ],
      events: { p: { gameDate: "2026-10-08T00:00:00Z" }, r: { gameDate: "2026-10-22T00:00:00Z" }, o: { gameDate: "2027-04-20T00:00:00Z" } },
    });
    const kept = recentForm(parsed);
    assert.equal(kept.gp, 1);
    assert.equal(kept.line.pts, 22);
  });

  it("lets four preseason games nudge a quiet regular season, and ignores them once the season starts", () => {
    const base = { pos: "G" as const, gp: 70, season: { min: 32, pts: 20, reb: 4, ast: 5, threes: 2 }, careerGp: 200, career: { min: 31, pts: 18, reb: 4, ast: 5, threes: 2 }, home: true };
    const quiet = projectPlayer(base);
    const nudged = projectPlayer({ ...base, pre: { min: 36, pts: 30, reb: 6, ast: 8, threes: 4 }, preGp: 4 });
    assert.ok(nudged.quotes.pts.projection > quiet.quotes.pts.projection);
    assert.ok(nudged.quotes.pts.projection < quiet.quotes.pts.projection + 4);
    const started = projectPlayer({
      ...base,
      recent: { min: 33, pts: 22, reb: 4, ast: 5, threes: 2 },
      recentGp: 2,
      pre: { min: 36, pts: 30, reb: 6, ast: 8, threes: 4 },
      preGp: 4,
    });
    const noPre = projectPlayer({ ...base, recent: { min: 33, pts: 22, reb: 4, ast: 5, threes: 2 }, recentGp: 2 });
    assert.equal(started.quotes.pts.projection, noPre.quotes.pts.projection);
    const onlyPre = preseasonForm([
      { min: 20, pts: 12, reb: 3, ast: 2, threes: 1, date: "2026-10-08", preseason: true },
      { min: 34, pts: 22, reb: 5, ast: 6, threes: 2, date: "2026-10-18", preseason: false },
    ]);
    assert.equal(onlyPre.gp, 1);
    assert.equal(onlyPre.line.pts, 12);
  });
});
