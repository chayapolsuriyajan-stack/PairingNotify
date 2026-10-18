/**
 * In-memory store, for tests and `next dev` without Redis. Kept on globalThis (see
 * index.js) so it survives Next's hot reloads during development.
 *
 * Like the Redis store it only provides raw keys and hashes; scoped.js turns those into
 * the per-user store the app uses.
 *
 * @typedef {{id:string, playerName:string, fideId:string|null, isMe:boolean,
 *            autoDiscover:boolean, tournaments:Array<{id:string,label:string}>}} Follow
 * @typedef {{endpoint:string, keys:{p256dh:string, auth:string}}} PushSub
 */

import { scopeStore } from './scoped.js';

export function createMemoryRaw() {
  const data = new Map();
  const hash = (key) => {
    if (!data.has(key)) data.set(key, new Map());
    return data.get(key);
  };

  return {
    kind: 'memory',
    async hgetall(key) {
      return Object.fromEntries([...(data.get(key)?.entries() ?? [])].map(([f, v]) => [f, structuredClone(v)]));
    },
    async hset(key, field, value) {
      hash(key).set(field, structuredClone(value));
    },
    async hdel(key, field) {
      data.get(key)?.delete(field);
    },
    async get(key) {
      return data.has(key) ? structuredClone(data.get(key)) : null;
    },
    async set(key, value) {
      data.set(key, structuredClone(value));
    },
    async del(...keys) {
      for (const key of keys) data.delete(key);
    },
    /** Take a named lock for ttlMs; false if someone else holds it. */
    async lock(key, ttlMs) {
      const until = data.get(key);
      if (until && until > Date.now()) return false;
      data.set(key, Date.now() + ttlMs);
      return true;
    },
    async unlock(key) {
      data.delete(key);
    },
  };
}

/** The owner's store on a fresh in-memory backend (tests use this directly). */
export function createMemoryStore() {
  return scopeStore(createMemoryRaw());
}
