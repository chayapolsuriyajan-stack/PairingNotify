/**
 * Upstash Redis store. Uses the env vars the Vercel Marketplace integration injects
 * (KV_REST_API_URL / KV_REST_API_TOKEN, or the newer UPSTASH_REDIS_REST_*).
 *
 * Only raw keys and hashes live here; scoped.js builds the per-user store on top.
 */

import { Redis } from '@upstash/redis';
import { scopeStore } from './scoped.js';

export function redisConfigured(env = process.env) {
  return Boolean(
    (env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL) &&
      (env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN),
  );
}

export function createRedisRaw(env = process.env) {
  const redis = new Redis({
    url: env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL,
    token: env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN,
  });

  return {
    kind: 'redis',
    async hgetall(key) {
      return (await redis.hgetall(key)) ?? {};
    },
    async hset(key, field, value) {
      await redis.hset(key, { [field]: value });
    },
    async hdel(key, field) {
      await redis.hdel(key, field);
    },
    async get(key) {
      return (await redis.get(key)) ?? null;
    },
    async set(key, value) {
      await redis.set(key, value);
    },
    async del(...keys) {
      if (keys.length) await redis.del(...keys);
    },
    /** Take a named lock for ttlMs (SET NX PX); false if someone else holds it. */
    async lock(key, ttlMs) {
      return (await redis.set(key, Date.now(), { nx: true, px: ttlMs })) === 'OK';
    },
    async unlock(key) {
      await redis.del(key);
    },
  };
}

/** The owner's store on Redis. */
export function createRedisStore(env = process.env) {
  return scopeStore(createRedisRaw(env));
}
