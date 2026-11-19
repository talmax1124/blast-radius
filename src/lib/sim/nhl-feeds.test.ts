import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  averages, boxStats, easternDate, espnSeason, nhlSeasonId, parseAmerican, parseCoreOdds, parsePropItems, parseResults,
  parseScoreboardOdds, toEspnAbbr, toiMinutes, toNhlAbbr, type NhlLogGame,
} from "./nhl-feeds.ts";

const ath = (id: string) => ({ $ref: `http://sports.core.api.espn.com/v2/sports/hockey/leagues/nhl/seasons/2027/athletes/${id}?lang=en` });
const item = (id: string, type: string, line: number | string | null, price: string, open = price) => ({
  athlete: ath(id),
  type: { name: type },
  odds: { american: { value: price, open }, total: { value: typeof line === "string" ? line : String(line) } },
  current: typeof line === "number" ? { target: { value: line } } : {},
  open: typeof line === "number" ? { target: { value: line } } : {},
  lastUpdated: "2026-11-16T10:27Z",
});

describe("nhl-feeds helpers", () => {
  it("parses American prices", () => {
    assert.equal(parseAmerican("-115"), -115);
    assert.equal(parseAmerican("+125"), 125);
    assert.equal(parseAmerican("EVEN"), 100);
    assert.equal(parseAmerican(114), 114);
    assert.equal(parseAmerican("OFF"), null);
    assert.equal(parseAmerican(""), null);
  });

  it("maps team abbreviations both ways and dates seasons", () => {
    assert.equal(toNhlAbbr("LA"), "LAK");
    assert.equal(toNhlAbbr("UTAH"), "UTA");
    assert.equal(toEspnAbbr("SJS"), "SJ");
    assert.equal(toEspnAbbr("NYR"), "NYR");
    assert.equal(espnSeason(new Date("2026-11-16T00:00Z")), 2027);
    assert.equal(espnSeason(new Date("2027-04-10T00:00Z")), 2027);
    assert.equal(nhlSeasonId(new Date("2026-11-16T00:00Z")), 20262027);
    assert.equal(easternDate("2026-11-17T00:30Z"), "20261116");
    assert.equal(toiMinutes("18:30"), 18.5);
    assert.equal(toiMinutes(""), 0);
  });

  it("reads main two-way lines over-first and milestone rungs as alt", () => {
    const rows = parsePropItems([
      item("1", "Total Shots on Goal", 2.5, "+125", "+135"),
      item("1", "Total Shots on Goal", 2.5, "-170", "-180"),
      item("1", "Shots on Goal Milestones", 3, "+125"),
      item("1", "Shots on Goal Milestones", 4, "+310"),
      item("1", "Anytime Goalscorer", null, "+225"),
      item("1", "Goals Milestones", 2, "+1800"),
      item("1", "To Score 2+ Goals", null, "+1800"),
      item("1", "First Goalscorer", null, "+1300"),
    ]);
    const main = rows.find((r) => r.stat === "sog" && !r.alt)!;
    assert.deepEqual([main.line, main.over, main.under, main.openOver, main.openUnder], [2.5, 125, -170, 135, -180]);
    const alt = rows.filter((r) => r.stat === "sog" && r.alt).map((r) => [r.line, r.over, r.under]);
    assert.deepEqual(alt, [[2.5, 125, null], [3.5, 310, null]]);
    const goals = rows.filter((r) => r.stat === "goals").map((r) => [r.line, r.over]).sort();
    assert.deepEqual(goals, [[0.5, 225], [1.5, 1800]]);
    assert.equal(rows.length, 5);
  });

  it("flips a main pair when the matching milestone rung prices like the second item", () => {
    const rows = parsePropItems([
      item("2", "Total Blocked Shots", 1.5, "-160"),
      item("2", "Total Blocked Shots", 1.5, "+115"),
      item("2", "Blocked Shots Milestones", 2, "+115"),
    ]);
    const main = rows.find((r) => !r.alt)!;
    assert.deepEqual([main.over, main.under], [115, -160]);
  });

  it("keeps a lone main item's line without guessing a side", () => {
    const [r] = parsePropItems([item("3", "Total Saves", 24.5, "-115")]);
    assert.deepEqual([r.stat, r.line, r.over, r.under], ["saves", 24.5, null, null]);
  });

  it("parses scoreboard and core game odds", () => {
    const sb = parseScoreboardOdds({
      provider: { name: "DraftKings" }, overUnder: 6.5,
      moneyline: { home: { close: { odds: "-105" }, open: { odds: "-105" } }, away: { close: { odds: "-115" }, open: { odds: "-110" } } },
      pointSpread: { home: { close: { line: "+1.5", odds: "-278" } }, away: { close: { line: "-1.5", odds: "+225" } } },
      total: { over: { close: { line: "o6.5", odds: "+114" } }, under: { close: { line: "u6.5", odds: "-135" } } },
    })!;
    assert.deepEqual([sb.awayMl, sb.homeMl, sb.homeSpread, sb.homeSpreadPrice, sb.awaySpreadPrice, sb.total, sb.overPrice, sb.underPrice], [-115, -105, 1.5, -278, 225, 6.5, 114, -135]);
    assert.equal(sb.open?.awayMl, -110);
    const core = parseCoreOdds({
      provider: { name: "DraftKings" }, overUnder: 5.5, spread: 1.5, overOdds: -122, underOdds: 102,
      awayTeamOdds: { moneyLine: -135, spreadOdds: 180, close: { moneyLine: { american: "-135" }, pointSpread: { american: "-1.5" }, spread: { american: "+180" } }, open: { moneyLine: { american: "-155" } } },
      homeTeamOdds: { moneyLine: 114, spreadOdds: -218, close: { moneyLine: { american: "+114" }, pointSpread: { american: "+1.5" }, spread: { american: "-218" } }, open: { moneyLine: { american: "+130" } } },
      close: { over: { american: "-122" }, under: { american: "+102" }, total: { american: "5.5" } },
      open: { total: { american: "6.5" } },
    })!;
    assert.deepEqual([core.awayMl, core.homeMl, core.homeSpread, core.homeSpreadPrice, core.awaySpreadPrice, core.total, core.overPrice, core.underPrice], [-135, 114, 1.5, -218, 180, 5.5, -122, 102]);
    assert.deepEqual([core.open?.awayMl, core.open?.homeMl, core.open?.total], [-155, 130, 6.5]);
  });

  it("parses an ESPN box score and picks the NHL-named starter when both goalies played", () => {
    const skKeys = ["blockedShots", "hits", "timeOnIce", "powerPlayTimeOnIce", "goals", "assists", "shotsTotal"];
    const gKeys = ["goalsAgainst", "shotsAgainst", "saves", "timeOnIce"];
    const summary = {
      header: { competitions: [{ status: { type: { name: "STATUS_FINAL", state: "post", completed: true, detail: "Final/OT" } }, competitors: [
        { homeAway: "home", team: { abbreviation: "UTAH" }, score: "3" }, { homeAway: "away", team: { abbreviation: "LA" }, score: "4" },
      ] }] },
      boxscore: { players: [{ team: { abbreviation: "UTAH" }, statistics: [
        { name: "defenses", keys: skKeys, athletes: [{ athlete: { id: "9", displayName: "Mikhail Sergachev" }, stats: ["3", "1", "24:10", "3:00", "0", "2", "4"] }] },
        { name: "goalies", keys: gKeys, athletes: [
          { athlete: { id: "7", displayName: "Karel Vejmelka" }, stats: ["4", "15", "11", "25:00"] },
          { athlete: { id: "8", displayName: "Vitek Vanecek" }, stats: ["0", "20", "20", "38:00"] },
        ] },
      ] }] },
    };
    const r = parseResults("1", summary, new Map([["UTA", "Karel Vejmelka"]]));
    assert.deepEqual([r.home, r.away, r.homeScore, r.awayScore, r.detail], ["UTA", "LA", 3, 4, "Final/OT"]);
    assert.deepEqual(r.skaters[0], { espnId: "9", name: "Mikhail Sergachev", team: "UTA", toi: 24 + 10 / 60, pos: "D", sog: 4, goals: 0, assists: 2, points: 2, blocks: 3, hits: 1, ppToi: 3 });
    assert.deepEqual(r.goalies.map((g) => [g.name, g.started]), [["Karel Vejmelka", true], ["Vitek Vanecek", false]]);
    const noNhl = parseResults("1", summary);
    assert.deepEqual(noNhl.goalies.map((g) => g.started), [false, true]);
    assert.deepEqual(boxStats(["a", "b"], ["1"]), { a: "1", b: "" });
  });

  it("averages goalie volume per start", () => {
    const g = (started: boolean, sa: number, sv: number): NhlLogGame => ({ gameId: 1, date: "", team: "X", opp: "Y", home: true, toi: started ? 60 : 20, shots: 0, goals: 0, assists: 0, points: 0, blocks: null, hits: null, ppPoints: null, started, shotsAgainst: sa, saves: sv, goalsAgainst: sa - sv });
    const a = averages([g(true, 30, 28), g(true, 20, 17), g(false, 8, 6)], true);
    assert.deepEqual([a.gp, a.starts, a.shotsAgainst, a.saves, a.blocks], [3, 2, 25, 22.5, null]);
  });
});
