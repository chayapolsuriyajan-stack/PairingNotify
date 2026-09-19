/**
 * In-memory store, for tests and `next dev` without Redis. Kept on globalThis (see
 * index.js) so it survives Next's hot reloads during development.
 *
 * @typedef {{id:string, playerName:string, fideId:string|null, isMe:boolean,
 *            autoDiscover:boolean, tournaments:Array<{id:string,label:string}>}} Follow
 * @typedef {{endpoint:string, keys:{p256dh:string, auth:string}}} PushSub
 */

export function createMemoryStore() {
  const follows = new Map();
  const subs = new Map();
  const values = new Map();

  return {
    kind: 'memory',
    async listFollows() {
      return [...follows.values()];
    },
    async saveFollow(follow) {
      follows.set(follow.id, follow);
    },
    async removeFollow(id) {
      follows.delete(id);
    },
    async listSubscriptions() {
      return [...subs.values()];
    },
    async saveSubscription(sub) {
      subs.set(sub.endpoint, sub);
    },
    async removeSubscription(endpoint) {
      subs.delete(endpoint);
    },
    /** Generic JSON values: 'state' (diff state), 'feed', 'poll' (poll bookkeeping). */
    async get(key) {
      return values.has(key) ? structuredClone(values.get(key)) : null;
    },
    async set(key, value) {
      values.set(key, structuredClone(value));
    },
  };
}
