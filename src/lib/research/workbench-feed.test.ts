import test from "node:test";
import assert from "node:assert/strict";
import { feed } from "./workbench.server.ts";

test("feed cache coalesces slow requests, starts TTL at completion, and retries failures", async () => {
  const originalFetch = globalThis.fetch,
    originalNow = Date.now;
  let clock = 0,
    calls = 0;
  let resolve!: (value: Response) => void;
  Date.now = () => clock;
  globalThis.fetch = async () => {
    calls++;
    return new Promise<Response>((done) => {
      resolve = done;
    });
  };
  try {
    const first = feed("https://fixture.test/live", 10_000);
    clock = 12_000;
    const second = feed("https://fixture.test/live", 10_000);
    assert.equal(calls, 1);
    resolve(Response.json({ count: 1 }));
    assert.deepEqual(await first, await second);
    clock = 21_999;
    assert.equal((await feed("https://fixture.test/live", 10_000)).count, 1);
    assert.equal(calls, 1);
    clock = 22_001;
    const failed = feed("https://fixture.test/live", 10_000);
    assert.equal(calls, 2);
    resolve(new Response(null, { status: 503 }));
    await assert.rejects(failed, /503/);
    const retry = feed("https://fixture.test/live", 10_000);
    assert.equal(calls, 3);
    resolve(Response.json({ count: 2 }));
    assert.equal((await retry).count, 2);
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
  }
});
