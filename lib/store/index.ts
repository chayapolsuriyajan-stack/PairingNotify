import { createMemoryStore } from './memory';
import { createRedisStore } from './redis';
import type { Store } from './types';

export type { Follow, PushSub, Store } from './types';

let cached: Store | undefined;

/** Redis when configured, otherwise an in-memory store (local dev only). */
export function getStore(): Store {
  cached ??= process.env.KV_REST_API_URL ? createRedisStore() : createMemoryStore();
  return cached;
}
