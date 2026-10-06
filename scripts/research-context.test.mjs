import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "vite";

test("daily AI brief gets cited matchup facts; ordinary research loads never call the model", async () => {
  const directory = await mkdtemp(join(tmpdir(), "great-run-context-test-"));
  const server = await createServer({
    configFile: false,
    cacheDir: join(directory, "cache"),
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false },
    resolve: { alias: { "@": resolve("src") } },
    appType: "custom",
    logLevel: "silent",
  });
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.XAI_API_KEY;
  const previousModel = process.env.RESEARCH_MODEL;
  let modelCalls = 0;
  try {
    process.env.XAI_API_KEY = "test-fixture-only";
    process.env.RESEARCH_MODEL = "fixture-model";
    globalThis.fetch = async (url, options) => {
      const path = String(url);
      if (path.includes("/news?"))
        return Response.json({
          articles: [
            {
              id: 1,
              headline: "Team update",
              description: "Reported information",
              published: new Date().toISOString(),
              links: { web: { href: "https://www.espn.com/story/1" } },
            },
          ],
        });
      if (path.includes("/scoreboard?"))
        return Response.json({
          events: [
            {
              id: "1",
              name: "Away at Home",
              date: new Date().toISOString(),
              competitions: [
                { status: { type: { state: "pre", detail: "Scheduled" } }, competitors: [] },
              ],
            },
          ],
        });
      if (path.includes("/summary?"))
        return Response.json({
          header: { id: "1", competitions: [] },
          injuries: [
            {
              team: { abbreviation: "HOME" },
              injuries: [
                {
                  athlete: { displayName: "Player" },
                  status: "Questionable",
                  date: "2026-10-01T12:00:00Z",
                },
              ],
            },
          ],
        });
      if (path === "https://api.x.ai/v1/chat/completions") {
        modelCalls++;
        const sent = JSON.parse(JSON.parse(options.body).messages[1].content);
        assert.equal(sent.sources.filter((s) => s.id.startsWith("game:")).length, 4);
        assert.ok(
          sent.sources.some(
            (s) => s.summary.includes("Questionable") && s.summary.includes("2026-10-01"),
          ),
        );
        return Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  insights: [
                    { text: "Check the dated availability report.", sourceIds: ["game:mlb:1"] },
                    { text: "Invented", sourceIds: ["missing"] },
                  ],
                }),
              },
            },
          ],
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    };
    const { buildResearchReport } = await server.ssrLoadModule(
      "/src/lib/research/engine.server.ts",
    );
    const live = await buildResearchReport();
    assert.equal(modelCalls, 0);
    assert.equal(live.context, undefined);
    assert.equal(live.feeds.length, 4);
    const daily = await buildResearchReport(true);
    assert.equal(modelCalls, 1);
    assert.equal(daily.context.length, 4);
    assert.equal(daily.mode, "model-assisted");
    assert.equal(daily.synthesis.length, 1);
    assert.deepEqual(daily.synthesis[0].sourceIds, ["game:mlb:1"]);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.XAI_API_KEY;
    else process.env.XAI_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.RESEARCH_MODEL;
    else process.env.RESEARCH_MODEL = previousModel;
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
