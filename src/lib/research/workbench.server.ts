import type { FeedObject } from "./workbench";
const cache = new Map<string, { expires: number; promise: Promise<FeedObject> }>();
export async function feed(url: string, ttl = 60_000): Promise<FeedObject> {
  const existing = cache.get(url);
  if (existing && existing.expires > Date.now()) return existing.promise;
  const promise = (async () => {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15_000),
      headers: { Accept: "application/json" },
    });
    if (!response.ok)
      throw new Error(`Sports source returned ${response.status}. Try again shortly.`);
    const body = (await response.json()) as FeedObject;
    return { ...body, retrievedAt: new Date().toISOString() };
  })();
  if (cache.size >= 200) cache.delete(cache.keys().next().value!);
  cache.set(url, { expires: Date.now() + ttl, promise });
  try {
    return await promise;
  } catch (error) {
    if (cache.get(url)?.promise === promise) cache.delete(url);
    throw error;
  }
}
