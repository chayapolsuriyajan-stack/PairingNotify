/**
 * Responses for the chess-results proxy. `s-maxage` lets Vercel's CDN answer repeat
 * requests, so everyone viewing the same standings costs chess-results one request a
 * minute; the in-process memo does the same for a warm function instance.
 */

export function cachedJson(data: unknown, seconds = 60) {
  return Response.json(data, {
    headers: { 'Cache-Control': `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=300` },
  });
}

export function errorJson(error: unknown, status = 502) {
  const message = error instanceof Error ? error.message : String(error);
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

type Entry = { at: number; value: Promise<unknown> };
const memoCache: Map<string, Entry> = ((globalThis as any).__pnMemo ??= new Map());

/** Share one in-flight/fresh result per key for ttlMs. Failures are not cached. */
export function memo<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = memoCache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = fn().catch((error) => {
    memoCache.delete(key);
    throw error;
  });
  memoCache.set(key, { at: Date.now(), value });
  if (memoCache.size > 500) memoCache.delete(memoCache.keys().next().value!);
  return value;
}

export function intParam(value: string | null, min: number, max: number): number | null {
  if (value == null || !/^\d+$/.test(value)) return null;
  const n = Number(value);
  return n >= min && n <= max ? n : null;
}
