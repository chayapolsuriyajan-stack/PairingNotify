import { createMemoryRaw, createMemoryStore } from './memory.js';
import { createRedisRaw, createRedisStore, redisConfigured } from './redis.js';
import { scopeStore, OWNER } from './scoped.js';

/** Redis when configured, otherwise in memory (local development only). */
export function getRawStore() {
  globalThis.__pairingRaw ??= redisConfigured() ? createRedisRaw() : createMemoryRaw();
  return globalThis.__pairingRaw;
}

/** One user's store; the owner's when no id is given. */
export function getStore(userId = OWNER) {
  return scopeStore(getRawStore(), userId);
}

export { createMemoryStore, createRedisStore, redisConfigured, scopeStore, OWNER };
