/**
 * Upstash Redis store. Uses the env vars the Vercel Marketplace integration injects
 * (KV_REST_API_URL / KV_REST_API_TOKEN, or the newer UPSTASH_REDIS_REST_*).
 */

import { Redis } from '@upstash/redis';

const K = { follows: 'pn:follows', subs: 'pn:subs', value: (key) => `pn:${key}` };

export function redisConfigured(env = process.env) {
  return Boolean(
    (env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL) &&
      (env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN),
  );
}

export function createRedisStore(env = process.env) {
  const redis = new Redis({
    url: env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL,
    token: env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN,
  });

  return {
    kind: 'redis',
    async listFollows() {
      return Object.values((await redis.hgetall(K.follows)) ?? {});
    },
    async saveFollow(follow) {
      await redis.hset(K.follows, { [follow.id]: follow });
    },
    async removeFollow(id) {
      await redis.hdel(K.follows, id);
    },
    async listSubscriptions() {
      return Object.values((await redis.hgetall(K.subs)) ?? {});
    },
    async saveSubscription(sub) {
      await redis.hset(K.subs, { [sub.endpoint]: sub });
    },
    async removeSubscription(endpoint) {
      await redis.hdel(K.subs, endpoint);
    },
    async get(key) {
      return (await redis.get(K.value(key))) ?? null;
    },
    async set(key, value) {
      await redis.set(K.value(key), value);
    },
    /** Take a named lock for ttlMs (SET NX PX); false if someone else holds it. */
    async lock(name, ttlMs) {
      return (await redis.set(K.value(`lock:${name}`), Date.now(), { nx: true, px: ttlMs })) === 'OK';
    },
    async unlock(name) {
      await redis.del(K.value(`lock:${name}`));
    },
  };
}
