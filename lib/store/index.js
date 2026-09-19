import { createMemoryStore } from './memory.js';
import { createRedisStore, redisConfigured } from './redis.js';

/** Redis when configured, otherwise an in-memory store (local development only). */
export function getStore() {
  globalThis.__pairingStore ??= redisConfigured() ? createRedisStore() : createMemoryStore();
  return globalThis.__pairingStore;
}

export { createMemoryStore, createRedisStore, redisConfigured };
