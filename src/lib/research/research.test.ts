import assert from "node:assert/strict";
import test from "node:test";
import { normalizeNews, validatedSynthesis } from "./normalize.ts";
import { cronAuthorized, easternClock } from "./schedule.ts";

const now = new Date("2026-10-05T12:00:00Z");
const valid = {
  id: 1,
  headline: "Starter returns to practice",
  description: "Team update",
  published: "2026-10-05T11:00:00Z",
  links: { web: { href: "https://www.espn.com/nfl/story/1?tracking=abc" } },
};

test("news drops stale, future, malformed, non-HTTPS, untrusted and duplicate sources", () => {
  const articles = normalizeNews(
    {
      articles: [
        valid,
        valid,
        { ...valid, published: "2026-09-01" },
        { ...valid, published: "2026-10-07" },
        { ...valid, published: "no date" },
        { ...valid, links: { web: { href: "javascript:alert(1)" } } },
        { ...valid, links: { web: { href: "https://espn.com.evil.test/story" } } },
      ],
    },
    "nfl",
    now,
  );
  assert.equal(articles.length, 1);
  assert.equal(articles[0].url, "https://www.espn.com/nfl/story/1");
  assert.equal(articles[0].id, "nfl:1");
});

test("missing article payload is a source error, not a successful empty feed", () => {
  assert.throws(() => normalizeNews({}, "mlb", now));
  assert.deepEqual(normalizeNews({ articles: [] }, "mlb", now), []);
});

test("synthesis rejects missing and invented citations", () => {
  const articles = normalizeNews({ articles: [valid] }, "nfl", now);
  const insights = validatedSynthesis(
    {
      insights: [
        { text: "Uncited claim", sourceIds: [] },
        { text: "Invented source", sourceIds: ["nfl:999"] },
        { text: "Mixed citation", sourceIds: ["nfl:1", "nfl:999"] },
        { text: "Reported return to practice", sourceIds: ["nfl:1", "nfl:1"] },
      ],
    },
    articles,
  );
  assert.deepEqual(insights, [{ text: "Reported return to practice", sourceIds: ["nfl:1"] }]);
});

test("8 AM Eastern follows daylight saving changes and date boundaries", () => {
  assert.equal(easternClock(new Date("2026-07-01T12:00:00Z")).hour, 8);
  assert.equal(easternClock(new Date("2026-01-01T13:00:00Z")).hour, 8);
  assert.equal(easternClock(new Date("2026-03-08T12:00:00Z")).hour, 8);
  assert.equal(easternClock(new Date("2026-11-01T13:00:00Z")).hour, 8);
  assert.equal(easternClock(new Date("2026-07-01T13:00:00Z")).hour, 9);
  assert.equal(easternClock(new Date("2026-01-01T12:00:00Z")).hour, 7);
  assert.equal(easternClock(new Date("2026-10-06T02:00:00Z")).date, "2026-10-05");
});

test("cron requires a configured exact bearer secret; provider header alone is rejected", () => {
  assert.equal(cronAuthorized(new Headers(), undefined), false);
  assert.equal(cronAuthorized(new Headers({ "x-vercel-cron": "1" }), "secret"), false);
  assert.equal(cronAuthorized(new Headers({ authorization: "Bearer wrong" }), "secret"), false);
  assert.equal(cronAuthorized(new Headers({ authorization: "Bearer secret" }), "secret"), true);
  assert.equal(cronAuthorized(new Headers({ authorization: "Bearer  " }), " "), false);
});
