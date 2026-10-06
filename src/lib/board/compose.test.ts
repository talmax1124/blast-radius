import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSlips, rankWin, sweepOf, takeLegs } from "./compose.ts";
import { adjustP, reportOf } from "./grade.ts";
import { americanProb, buildPrice, oddsBrief, spreadRead } from "./odds.ts";
import { devig, golfLine, parseScoreboard } from "./slate.ts";
import type { BoardLeg, LedgerLeg } from "./types.ts";

function leg(partial: Partial<BoardLeg> & Pick<BoardLeg, "id" | "gameId" | "p" | "market">): BoardLeg {
  return {
    sport: "nhl",
    date: "2026-10-04",
    game: partial.gameId,
    playerId: partial.id,
    name: partial.id,
    team: "X",
    marketLabel: partial.market,
    prop: partial.market,
    note: "",
    settled: null,
    ...partial,
  };
}

describe("board", () => {
  it("caps a ranking favorite below a fake lock", () => {
    const p = rankWin(1, 40);
    assert.ok(p > 0.75 && p <= 0.88);
  });

  it("keeps a close ranking match near a coin flip", () => {
    const p = rankWin(8, 11);
    assert.ok(p > 0.5 && p < 0.62);
  });

  it("puts one player in each game", () => {
    const pool = [
      leg({ id: "a", gameId: "g1", p: 0.8, market: "sog15" }),
      leg({ id: "b", gameId: "g1", p: 0.77, market: "point" }),
      leg({ id: "c", gameId: "g2", p: 0.7, market: "sog15" }),
      leg({ id: "d", gameId: "g3", p: 0.66, market: "goal" }),
    ];
    const picked = takeLegs(pool, 3, false);
    assert.ok(picked);
    assert.equal(new Set(picked.map((l) => l.gameId)).size, 3);
    assert.equal(picked[0].id, "a");
  });

  it("builds a mix that does not repeat the same prop when a close alternative exists", () => {
    const pool = [
      leg({ id: "a", gameId: "g1", p: 0.8, market: "sog15" }),
      leg({ id: "b", gameId: "g2", p: 0.78, market: "sog15" }),
      leg({ id: "c", gameId: "g2", p: 0.76, market: "point" }),
    ];
    const slips = buildSlips(pool, "nhl");
    const mix = slips.find((s) => s.size === 2 && s.kind === "mix");
    assert.ok(mix);
    assert.equal(new Set(mix.legs.map((l) => l.market)).size, 2);
    assert.ok(sweepOf(mix.legs) < 0.8);
  });

  it("pulls a leaking market toward a coin flip and writes the gap", () => {
    const book: LedgerLeg[] = Array.from({ length: 6 }, (_, i) => ({
      id: String(i),
      date: "2026-10-01",
      sport: "nhl",
      market: "sog25",
      marketLabel: "Shots 2.5",
      name: "A",
      prop: "Over 2.5",
      p: 0.7,
      result: i === 0 ? "hit" : "miss",
    }));
    const next = adjustP(0.8, "nhl", "sog25", book);
    assert.ok(next < 0.8);
    const report = reportOf(book);
    assert.equal(report.hits, 1);
    assert.ok(report.lines.some((line) => line.includes("leak")));
    assert.ok((report.brier ?? 1) > 0.2);
  });

  it("removes the juice from a two-way price and skips an unpriced game", () => {
    const fair = devig([americanProb(-166), americanProb(140)]);
    assert.ok(fair[0] > 0.55 && fair[0] < 0.68);
    assert.ok(Math.abs(fair[0] + fair[1] - 1) < 0.001);
    const board = parseScoreboard(
      {
        events: [
          {
            competitions: [
              {
                id: "1",
                status: { type: { state: "pre" } },
                competitors: [
                  { homeAway: "away", team: { displayName: "Liberty", abbreviation: "NY", shortDisplayName: "Liberty" } },
                  { homeAway: "home", team: { displayName: "Dream", abbreviation: "ATL", shortDisplayName: "Dream" } },
                ],
                odds: [{ details: "ATL -3.5", overUnder: 173.5, moneyline: { home: { close: { odds: "-166" } }, away: { close: { odds: "+140" } } } }],
              },
            ],
          },
          {
            competitions: [
              {
                id: "2",
                status: { type: { state: "pre" } },
                competitors: [
                  { homeAway: "away", team: { abbreviation: "UTA", shortDisplayName: "Jazz" } },
                  { homeAway: "home", team: { abbreviation: "DEN", shortDisplayName: "Nuggets" } },
                ],
              },
            ],
          },
        ],
      },
      "wnba",
      "2026-10-04",
    );
    assert.equal(board.games.length, 2);
    assert.equal(board.games[1].priced, false);
    assert.equal(board.legs.length, 1);
    assert.equal(board.legs[0].name, "Dream");
    assert.ok(board.legs[0].p > 0.56);
  });

  it("names the golf leader and does not invent a price", () => {
    const line = golfLine({
      events: [
        {
          name: "Bank of Utah Championship",
          competitions: [
            {
              status: { type: { shortDetail: "Round 3 - Play Complete" } },
              competitors: [{ athlete: { displayName: "Austin Smotherman" }, score: "-23" }],
            },
          ],
        },
      ],
    });
    assert.match(line ?? "", /Smotherman -23/);
    assert.match(line ?? "", /No outright price/);
  });

  it("strips the juice and flags an expensive favorite", () => {
    const card = buildPrice({
      id: "1",
      sport: "nwsl",
      label: "DEN @ CHI",
      sides: [
        { name: "Denver", american: -285 },
        { name: "Chicago", american: 500 },
        { name: "Draw", american: 270 },
      ],
    });
    assert.ok(card);
    assert.equal(card.favorite, "Denver");
    assert.ok(card.hold > 0.07);
    assert.match(card.read, /expensive/);
    assert.ok(card.fair < americanProb(-285));
    assert.match(card.read, /Denver/);
    const brief = oddsBrief([card]);
    assert.match(brief.lines[0], /1 posted/);
  });

  it("converts a spread without calling it a moneyline", () => {
    const row = spreadRead("BUF -6.5");
    assert.ok(row);
    assert.equal(row.favorite, "BUF");
    assert.ok(row.fair > 0.65 && row.fair < 0.75);
    assert.match(row.read, /not a posted moneyline/);
  });
});
