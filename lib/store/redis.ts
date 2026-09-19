import { Redis } from '@upstash/redis';
import type { Follow, PushSub, Store } from './types';

const K = {
  follows: 'pn:follows',
  subs: 'pn:subs',
  state: 'pn:state',
  feed: 'pn:feed',
};

/** Upstash Redis-backed Store. Uses the KV_* vars the Vercel integration injects. */
export function createRedisStore(): Store {
  const redis = new Redis({
    url: process.env.KV_REST_API_URL!,
    token: process.env.KV_REST_API_TOKEN!,
  });

  return {
    async listFollows() {
      return Object.values((await redis.hgetall<Record<string, Follow>>(K.follows)) ?? {});
    },
    async saveFollow(f) { await redis.hset(K.follows, { [f.id]: f }); },
    async removeFollow(id) { await redis.hdel(K.follows, id); },

    async listSubscriptions() {
      return Object.values((await redis.hgetall<Record<string, PushSub>>(K.subs)) ?? {});
    },
    async saveSubscription(s) { await redis.hset(K.subs, { [s.endpoint]: s }); },
    async removeSubscription(endpoint) { await redis.hdel(K.subs, endpoint); },

    async getState() {
      return (await redis.get<{ version: number; players: Record<string, unknown> }>(K.state))
        ?? { version: 1, players: {} };
    },
    async setState(s) { await redis.set(K.state, s); },
    async getFeed() { return (await redis.get(K.feed)) ?? null; },
    async setFeed(f) { await redis.set(K.feed, f); },
  };
}
