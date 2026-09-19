import type { Follow, PushSub, Store } from './types';

/** In-memory Store for tests and `next dev` without Redis. */
export function createMemoryStore(): Store {
  const follows = new Map<string, Follow>();
  const subs = new Map<string, PushSub>();
  let state: { version: number; players: Record<string, unknown> } = { version: 1, players: {} };
  let feed: unknown | null = null;

  return {
    async listFollows() { return [...follows.values()]; },
    async saveFollow(f) { follows.set(f.id, f); },
    async removeFollow(id) { follows.delete(id); },
    async listSubscriptions() { return [...subs.values()]; },
    async saveSubscription(s) { subs.set(s.endpoint, s); },
    async removeSubscription(endpoint) { subs.delete(endpoint); },
    async getState() { return state; },
    async setState(s) { state = s; },
    async getFeed() { return feed; },
    async setFeed(f) { feed = f; },
  };
}
