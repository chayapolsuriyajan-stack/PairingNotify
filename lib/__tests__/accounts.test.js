import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { createMemoryRaw } from '../store/memory.js';
import { scopeStore, OWNER } from '../store/scoped.js';
import {
  createInvite,
  formatCode,
  listInvites,
  listUsers,
  normaliseCode,
  redeemCode,
  removeUser,
  rotateCode,
  INVITE_TTL,
} from '../accounts.js';
import { runPollForAll } from '../poll.js';

const T0 = Date.UTC(2026, 9, 18, 4, 0, 0);

describe('scoped stores', () => {
  test("users never see each other's follows, devices or values", async () => {
    const raw = createMemoryRaw();
    const owner = scopeStore(raw, OWNER);
    const amy = scopeStore(raw, 'u_amy');
    await owner.saveFollow({ id: 'a', playerName: 'Owner, Self' });
    await amy.saveFollow({ id: 'b', playerName: 'Amy, Friend' });
    await amy.saveSubscription({ endpoint: 'https://push/amy', keys: {} });
    await amy.set('feed', { mine: true });

    assert.deepEqual((await owner.listFollows()).map((f) => f.id), ['a']);
    assert.deepEqual((await amy.listFollows()).map((f) => f.id), ['b']);
    assert.deepEqual(await owner.listSubscriptions(), []);
    assert.equal(await owner.get('feed'), null);
  });

  test('the owner keeps the original key names (no migration)', async () => {
    const raw = createMemoryRaw();
    await scopeStore(raw).saveFollow({ id: 'a' });
    await scopeStore(raw).set('feed', 1);
    assert.deepEqual(Object.keys(await raw.hgetall('pn:follows')), ['a']);
    assert.equal(await raw.get('pn:feed'), 1);
  });
});

describe('invite codes', () => {
  test('codes are 8 unambiguous characters, typed any way', () => {
    assert.equal(normaliseCode('k7qm-3xtp'), 'K7QM3XTP');
    assert.equal(normaliseCode(' K7QM 3XTP '), 'K7QM3XTP');
    assert.equal(normaliseCode('K7QM-3XT0'), null, 'no zero');
    assert.equal(normaliseCode('my passcode'), null);
    assert.equal(formatCode('K7QM3XTP'), 'K7QM-3XTP');
  });

  test('an invite creates an account once, then signs in as that account', async () => {
    const raw = createMemoryRaw();
    const invite = await createInvite(raw, { name: 'Amy', now: T0 });
    const first = await redeemCode(raw, formatCode(invite.code), T0 + 1000);
    assert.equal(first.created, true);
    const again = await redeemCode(raw, invite.code, T0 + 2000);
    assert.deepEqual(again, { userId: first.userId, created: false }, 'same person, other device');
    assert.equal((await listUsers(raw)).length, 1);
    assert.equal((await listUsers(raw))[0].name, 'Amy');
  });

  test('an unused invite expires after a week; a used one keeps working', async () => {
    const raw = createMemoryRaw();
    const unused = await createInvite(raw, { now: T0 });
    const used = await createInvite(raw, { now: T0 });
    await redeemCode(raw, used.code, T0);
    const late = T0 + INVITE_TTL + 1;
    assert.equal(await redeemCode(raw, unused.code, late), null);
    assert.ok(await redeemCode(raw, used.code, late));
    assert.deepEqual((await listInvites(raw, late)).map((i) => i.code), [used.code]);
  });

  test('a rotated code replaces the old one', async () => {
    const raw = createMemoryRaw();
    const invite = await createInvite(raw, { now: T0 });
    const { userId } = await redeemCode(raw, invite.code, T0);
    const fresh = await rotateCode(raw, userId, T0);
    assert.equal(await redeemCode(raw, invite.code, T0), null);
    assert.equal((await redeemCode(raw, fresh.code, T0)).userId, userId);
  });

  test('removing an account deletes its data and its code', async () => {
    const raw = createMemoryRaw();
    const invite = await createInvite(raw, { now: T0 });
    const { userId } = await redeemCode(raw, invite.code, T0);
    const store = scopeStore(raw, userId);
    await store.saveFollow({ id: 'x' });
    await store.set('feed', { x: 1 });

    await removeUser(raw, userId);
    assert.deepEqual(await store.listFollows(), []);
    assert.equal(await store.get('feed'), null);
    assert.equal(await redeemCode(raw, invite.code, T0), null);
    assert.deepEqual(await listUsers(raw), []);
  });
});

describe('polling every account', () => {
  const card = { title: 'Open', rounds: [{ round: 1, board: 3, opponent: 'X', paired: true, result: null }] };

  function site() {
    const calls = [];
    return {
      calls,
      fetchers: {
        async discoverTournaments() {
          return [];
        },
        async fetchStartingRank(id) {
          calls.push(`rank:${id}`);
          return { title: 'Open', players: [{ startNo: 7, name: 'Same, Player', fideId: '1' }] };
        },
        async fetchPlayerCard(id, startNo) {
          calls.push(`card:${id}:${startNo}`);
          return card;
        },
      },
    };
  }

  test('two accounts following the same player cost one request each page', async () => {
    const raw = createMemoryRaw();
    const stores = [scopeStore(raw, OWNER), scopeStore(raw, 'u_amy')];
    for (const s of stores) {
      await s.saveFollow({ id: 'f', playerName: 'Same, Player', isMe: true, tournaments: [{ id: '999' }] });
    }
    const fake = site();
    const result = await runPollForAll({ stores, fetchers: fake.fetchers, now: T0, vapid: null, log: () => {} });
    assert.deepEqual(fake.calls, ['rank:999', 'card:999:7']);
    assert.equal(result.fetches, 2);
    for (const s of stores) assert.equal((await s.get('feed')).follows[0].tournaments.length, 1);
  });

  test('the request budget is shared: a tick never exceeds it across accounts', async () => {
    const raw = createMemoryRaw();
    const stores = [];
    for (let u = 0; u < 4; u++) {
      const s = scopeStore(raw, u === 0 ? OWNER : `u_${u}`);
      const tournaments = Array.from({ length: 4 }, (_, i) => ({ id: String(100 + u * 10 + i) }));
      await s.saveFollow({ id: 'f', playerName: 'Same, Player', isMe: true, tournaments });
      stores.push(s);
    }
    const fake = site();
    const result = await runPollForAll({ stores, fetchers: fake.fetchers, now: T0, vapid: null, log: () => {} });
    assert.ok(result.fetches <= 10, `${result.fetches} requests`);
    assert.equal(fake.calls.length, result.fetches);
  });
});
