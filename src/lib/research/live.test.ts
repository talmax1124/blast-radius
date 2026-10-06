import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeLive,
  normalizeVenue,
  pollInterval,
  isStale,
  matchMlbVenue,
  mapUrls,
} from "./live.ts";
test("live polling covers pregame transitions, final corrections and pause", () => {
  assert.equal(pollInterval("in"), 15000);
  assert.equal(pollInterval("pre"), 60000);
  assert.equal(pollInterval("post"), 300000);
  assert.equal(pollInterval("in", false), false);
  assert.equal(isStale("2026-10-05T12:00:00Z", 15000, Date.parse("2026-10-05T12:00:46Z")), true);
  assert.equal(isStale("2026-10-05T12:00:00Z", 60000, Date.parse("2026-10-05T12:01:00Z")), false);
});
test("baseball feed chronology survives sequence counters resetting between at-bats", () => {
  const raw = {
    plays: [
      {
        id: "old",
        text: "old pitch",
        sequenceNumber: "9",
        atBatId: "a",
        summaryType: "P",
        pitchCoordinate: { x: 100, y: 150 },
      },
      {
        id: "new",
        text: "new pitch",
        sequenceNumber: "1",
        atBatId: "b",
        summaryType: "P",
        pitchCoordinate: { x: 110, y: 160 },
      },
      {
        id: "summary",
        text: "at bat result",
        sequenceNumber: "2",
        atBatId: "b",
        summaryType: "A",
        pitchCoordinate: { x: 110, y: 160 },
      },
    ],
  };
  const result = normalizeLive(raw, "mlb");
  assert.deepEqual(
    result.plays.map((p) => p.id),
    ["summary", "new", "old"],
  );
  assert.equal(result.plays[0].pitch, null);
  assert.equal(result.plays[1].pitch?.x, 110);
  assert.deepEqual(result.situation.bases, [null, null, null]);
});
test("football drives deduplicate plays and reject inconsistent turnover coordinates", () => {
  const play = {
    id: "1",
    text: "Run",
    start: { yardsToEndzone: 30, team: { id: "a" } },
    end: { yardsToEndzone: 20, team: { id: "a" } },
  };
  const result = normalizeLive(
    {
      drives: {
        previous: [{ plays: [play] }],
        current: {
          plays: [play, { ...play, id: "2", end: { yardsToEndzone: 90, team: { id: "b" } } }],
        },
      },
    },
    "nfl",
  );
  assert.equal(result.plays.length, 2);
  assert.equal(result.plays[0].end, null);
  assert.equal(result.plays[1].end, 20);
});
test("venue coordinates require a unique exact-name match and valid ranges", () => {
  const venue = {
    name: "Ball Park",
    location: { defaultCoordinates: { latitude: 28, longitude: -82 } },
  };
  assert.deepEqual(matchMlbVenue([venue], "Ball-Park"), { lat: 28, lon: -82 });
  assert.equal(matchMlbVenue([venue, venue], "Ball Park"), null);
  assert.equal(matchMlbVenue([venue], "Other Park"), null);
  assert.equal(
    matchMlbVenue(
      [{ ...venue, location: { defaultCoordinates: { latitude: 99, longitude: 0 } } }],
      "Ball Park",
    ),
    null,
  );
  assert.match(mapUrls(28, -82)!.embed, /openstreetmap.org\/export\/embed/);
  assert.equal(mapUrls(NaN, 0), null);
  assert.equal(
    normalizeVenue({ gameInfo: { venue: { images: [{ href: "javascript:alert(1)" }] } } }).image,
    "",
  );
});
test("source probabilities and occupancy are validated without inventing missing data", () => {
  const result = normalizeLive(
    {
      situation: { onFirst: true, onSecond: false },
      winprobability: [
        { homeWinPercentage: 0.7, playId: "x" },
        { homeWinPercentage: 7 },
        { homeWinPercentage: "0.2" },
      ],
    },
    "mlb",
  );
  assert.deepEqual(result.situation.bases, [true, false, null]);
  assert.equal(result.winProbability.length, 1);
});
