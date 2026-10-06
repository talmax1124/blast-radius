import test from "node:test";
import assert from "node:assert/strict";
import {
  implied,
  priorGameRows,
  normalizeGame,
  normalizeLog,
  normalizeSummary,
  sampleStats,
  safeEspnUrl,
} from "./workbench.ts";

test("moneyline calculations reject unavailable quotes, zero and malformed prices", () => {
  assert.equal(implied("OFF"), null);
  assert.equal(implied(""), null);
  assert.equal(implied(0), null);
  assert.equal(implied(50), null);
  assert.equal(implied("+100"), 0.5);
  assert.equal(implied("-200"), 2 / 3);
  const result = normalizeSummary(
    {
      header: { id: "1" },
      pickcenter: [
        {
          provider: { name: "Book" },
          moneyline: {
            home: { open: { odds: "-120" }, live: { odds: "OFF" } },
            away: { open: { odds: "+110" }, live: { odds: "+300" } },
          },
        },
      ],
    },
    "mlb",
  );
  assert.equal(result.markets.length, 2);
  assert.ok(Math.abs(result.markets[0].homeFair! + result.markets[0].awayFair! - 1) < 1e-12);
  assert.equal(result.markets[1].homeFair, null);
  assert.equal(result.markets[1].awayFair, null);
});
test("lineup roles are preserved and different player box-score categories accumulate", () => {
  const result = normalizeSummary(
    {
      header: { id: "123" },
      retrievedAt: "2026-10-05T12:00:00Z",
      rosters: [
        {
          team: { abbreviation: "NYY" },
          roster: [
            {
              athlete: { id: "7", displayName: "Player", bats: { displayValue: "Left" } },
              starter: true,
              batOrder: 2,
              position: { abbreviation: "DH" },
              stats: [],
            },
          ],
        },
      ],
      boxscore: {
        players: [
          {
            team: { abbreviation: "NYY" },
            statistics: [
              {
                type: "batting",
                labels: ["HR"],
                athletes: [{ athlete: { id: "7", displayName: "Player" }, stats: ["2"] }],
              },
              {
                type: "fielding",
                labels: ["E"],
                athletes: [{ athlete: { id: "7", displayName: "Player" }, stats: ["0"] }],
              },
            ],
          },
        ],
      },
    },
    "mlb",
  );
  assert.equal(result.players.length, 1);
  assert.equal(result.players[0].starter, true);
  assert.equal(result.players[0].order, 2);
  assert.deepEqual(result.players[0].stats, [
    { label: "batting HR", value: "2" },
    { label: "fielding E", value: "0" },
  ]);
  assert.equal(result.fetchedAt, "2026-10-05T12:00:00Z");
});
test("game logs deduplicate double categories without merging actual doubleheaders and distinguish football yards", () => {
  const event = (id: string) => ({ eventId: id, stats: ["22", "14"] });
  const data = normalizeLog(
    {
      labels: ["YDS", "YDS"],
      displayNames: ["Rushing Yards", "Receiving Yards"],
      events: {
        a: {
          gameDate: "2026-10-01T20:00:00Z",
          opponent: { id: "1", abbreviation: "TB" },
          atVs: "@",
        },
        b: { gameDate: "2026-10-01T14:00:00Z", opponent: { id: "1" } },
      },
      seasonTypes: [
        {
          displayName: "Regular season",
          categories: [
            { events: [event("a"), event("b")] },
            { events: [event("a"), event("missing")] },
          ],
        },
      ],
    },
    "nfl",
    "1",
  );
  assert.equal(data.rows.length, 2);
  assert.equal(data.rows[0].id, "a");
  assert.deepEqual(data.labels, ["Rushing Yards", "Receiving Yards"]);
});
test("samples do not treat missing or compound values as zero and distinguish pushes", () => {
  const rows = ["0", "1", "2", "-", "", "2-4"].map((stat, i) => ({
    id: String(i),
    date: "",
    opponent: "",
    opponentId: "",
    location: "",
    result: "",
    seasonType: "",
    stats: [stat],
  }));
  const result = sampleStats(rows, 0, 1);
  assert.equal(result.n, 3);
  assert.equal(result.over, 1);
  assert.equal(result.push, 1);
  assert.equal(result.average, 1);
  assert.equal(result.median, 1);
  assert.equal(sampleStats([], 0, 0.5).average, null);
});
test("source links are constrained and missing optional sections normalize to honest empty data", () => {
  assert.equal(safeEspnUrl("javascript:alert(1)"), "");
  assert.equal(safeEspnUrl("https://espn.com.evil.test"), "");
  assert.equal(safeEspnUrl("https://www.espn.com/mlb/"), "https://www.espn.com/mlb/");
  const result = normalizeSummary({ header: { id: "1" } }, "mlb");
  assert.deepEqual(result.players, []);
  assert.deepEqual(result.markets, []);
  assert.equal(result.weather, "Not supplied");
  const game = normalizeGame({
    id: "1",
    status: { type: { state: "pre" } },
    competitions: [
      {
        competitors: [
          { homeAway: "home", team: { id: "2" }, score: { displayValue: "0" } },
          { homeAway: "away", team: { id: "1" }, score: "0" },
        ],
      },
    ],
  });
  assert.equal(game.teams[0].side, "away");
  assert.equal(game.teams[1].score, "0");
  assert.equal(game.state, "pre");
});

test("research windows exclude selected-day and future games in Eastern time before filtering the opponent", () => {
  const row = (id: string, date: string, opponentId: string, location: string) => ({
    id,
    date,
    opponentId,
    opponent: opponentId,
    location,
    result: "",
    seasonType: "",
    stats: ["1"],
  });
  const rows = [
    row("future", "2026-10-07T01:00:00Z", "1", "vs"),
    row("same", "2026-10-06T01:00:00Z", "1", "vs"),
    row("prior", "2026-10-05T01:00:00Z", "1", "@"),
    row("other", "2026-10-04T01:00:00Z", "2", "vs"),
  ];
  assert.deepEqual(
    priorGameRows(rows, "2026-10-05", "opponent", "1", "10").map((r) => r.id),
    ["prior"],
  );
  assert.deepEqual(
    priorGameRows(rows, "2026-10-05", "home", "1", "all").map((r) => r.id),
    ["other"],
  );
  assert.equal(priorGameRows(rows, "2026-10-05", "all", "1", "1").length, 1);
});

test("season years follow the provider rather than the calendar year", () => {
  const game = normalizeGame({
    id: "1",
    date: "2026-10-06T23:00Z",
    season: { year: 2027 },
    competitions: [],
  });
  assert.equal(game.season, 2027);
});
