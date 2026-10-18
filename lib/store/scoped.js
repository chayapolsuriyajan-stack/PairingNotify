/**
 * One user's view of the store: their follows, devices and JSON values (feed, poll
 * bookkeeping, diff state, settings).
 *
 * The owner (whoever holds APP_PASSCODE) keeps the original key names, so the data that
 * existed before accounts did needs no migration. Everyone who joined by invite gets the
 * same keys under `pn:u:<id>:`. Locks are global: there is one poller for everybody.
 */

export const OWNER = 'owner';

/** Every JSON value a user can have, so deleting a user leaves nothing behind. */
export const USER_VALUES = ['feed', 'poll', 'state', 'settings'];

const prefixFor = (userId) => (userId === OWNER ? 'pn:' : `pn:u:${userId}:`);

/**
 * @param {object} raw  memory.js#createMemoryRaw or redis.js#createRedisRaw
 * @param {string} [userId]
 */
export function scopeStore(raw, userId = OWNER) {
  const prefix = prefixFor(userId);
  const K = { follows: `${prefix}follows`, subs: `${prefix}subs`, value: (key) => `${prefix}${key}` };

  return {
    kind: raw.kind,
    userId,
    raw,
    /** The same backend, seen as another user. */
    forUser: (id) => scopeStore(raw, id),

    async listFollows() {
      return Object.values(await raw.hgetall(K.follows));
    },
    async saveFollow(follow) {
      await raw.hset(K.follows, follow.id, follow);
    },
    async removeFollow(id) {
      await raw.hdel(K.follows, id);
    },
    async listSubscriptions() {
      return Object.values(await raw.hgetall(K.subs));
    },
    async saveSubscription(sub) {
      await raw.hset(K.subs, sub.endpoint, sub);
    },
    async removeSubscription(endpoint) {
      await raw.hdel(K.subs, endpoint);
    },
    /** Generic JSON values: 'state' (diff state), 'feed', 'poll', 'settings'. */
    async get(key) {
      return raw.get(K.value(key));
    },
    async set(key, value) {
      await raw.set(K.value(key), value);
    },
    /** Take a named lock for ttlMs; false if someone else holds it. */
    async lock(name, ttlMs) {
      return raw.lock(`pn:lock:${name}`, ttlMs);
    },
    async unlock(name) {
      await raw.unlock(`pn:lock:${name}`);
    },
    /** Delete everything this user has. */
    async destroy() {
      await raw.del(K.follows, K.subs, ...USER_VALUES.map(K.value));
    },
  };
}
