import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { runPoll, pollInterval } from '../poll.js';
import { createMemoryStore } from '../store/memory.js';

const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 8, 19, 4, 0, 0);

const round = (n, extra = {}) => ({
  round: n,
  board: 10 + n,
  opponentNo: 20 + n,
  opponent: `Opponent ${n}`,
  rating: 2000 + n,
  federation: 'THA',
  colour: n % 2 ? 'white' : 'black',
  result: null,
  paired: true,
  ...extra,
});

/** A fake chess-results whose player card we can change between ticks. */
function fakeSite() {
  const site = {
    rounds: [round(1)],
    calls: [],
    fetchers: {
      async discoverTournaments() {
        site.calls.push('discover');
        return [];
      },
      async fetchStartingRank(id) {
        site.calls.push(`rank:${id}`);
        return {
          title: 'Test Open 2026',
          players: [
            { startNo: 1, name: 'Somebody, Else', rating: 2100, federation: 'THA', fideId: '1' },
            { startNo: 7, name: 'Suriyajan, Chayapol', rating: 1900, federation: 'THA', fideId: '6200456' },
            { startNo: 9, name: 'Kantor, Sam', rating: 1664, federation: 'CAN', fideId: '2' },
          ],
        };
      },
      async fetchPlayerCard(id, startNo) {
        site.calls.push(`card:${id}:${startNo}`);
        return { rounds: site.rounds };
      },
    },
  };
  return site;
}

function fakePush() {
  const push = { sent: [], dead: new Set() };
  push.sender = async (sub, body) => {
    if (push.dead.has(sub.endpoint)) throw Object.assign(new Error('gone'), { statusCode: 410 });
    push.sent.push({ endpoint: sub.endpoint, ...JSON.parse(body) });
  };
  return push;
}

async function setup({ follows } = {}) {
  const store = createMemoryStore();
  for (const f of follows ?? [
    { id: 'me', playerName: 'Suriyajan, Chayapol', fideId: null, isMe: true, autoDiscover: false, tournaments: [{ id: '999', label: 'Test' }] },
  ]) {
    await store.saveFollow(f);
  }
  await store.saveSubscription({ endpoint: 'https://push.example/phone', keys: { p256dh: 'x', auth: 'y' } });
  await store.saveSubscription({ endpoint: 'https://push.example/tablet', keys: { p256dh: 'x', auth: 'y' } });
  return { store, site: fakeSite(), push: fakePush() };
}

const tick = (ctx, now, extra = {}) =>
  runPoll({ store: ctx.store, fetchers: ctx.site.fetchers, sender: ctx.push.sender, vapid: null, now, log: () => {}, ...extra });

describe('runPoll', () => {
  test('first sight seeds silently, then a new round pushes to every device', async () => {
    const ctx = await setup();

    const first = await tick(ctx, T0);
    assert.equal(first.newPairings.length, 0);
    assert.equal(ctx.push.sent.length, 0);

    ctx.site.rounds = [round(1), round(2)];
    const second = await tick(ctx, T0 + 60_000);
    assert.equal(second.newPairings.length, 1);
    assert.deepEqual(
      ctx.push.sent.map((p) => [p.endpoint, p.title]),
      [
        ['https://push.example/phone', 'RD 2 · BD 12'],
        ['https://push.example/tablet', 'RD 2 · BD 12'],
      ],
    );
    assert.equal(ctx.push.sent[0].url, '/t/999?p=7');
  });

  test('a bye never pushes', async () => {
    const ctx = await setup();
    await tick(ctx, T0);
    ctx.site.rounds = [round(1), round(2, { paired: false, opponent: null, board: null })];
    const result = await tick(ctx, T0 + 60_000);
    assert.equal(result.newPairings.length, 0);
    assert.equal(ctx.push.sent.length, 0);
  });

  test('a dead subscription (HTTP 410) is removed, the others still get the push', async () => {
    const ctx = await setup();
    await tick(ctx, T0);
    ctx.push.dead.add('https://push.example/tablet');
    ctx.site.rounds = [round(1), round(2)];
    const result = await tick(ctx, T0 + 60_000);

    assert.deepEqual(result.push.expired, ['https://push.example/tablet']);
    assert.deepEqual((await ctx.store.listSubscriptions()).map((s) => s.endpoint), ['https://push.example/phone']);
    assert.equal(ctx.push.sent.length, 1);
  });

  test('caches the start number: a normal tick is one request per player', async () => {
    const ctx = await setup();
    await tick(ctx, T0);
    ctx.site.calls.length = 0;
    await tick(ctx, T0 + 60_000);
    assert.deepEqual(ctx.site.calls, ['card:999:7']);
  });

  test('backs off on a tournament that has been quiet for hours', async () => {
    const ctx = await setup();
    await tick(ctx, T0);
    ctx.site.calls.length = 0;

    await tick(ctx, T0 + 7 * HOUR); // quiet 7h -> interval 15 min, last poll 7h ago -> due
    assert.equal(ctx.site.calls.length, 1);
    await tick(ctx, T0 + 7 * HOUR + 60_000); // 1 minute later -> not due
    assert.equal(ctx.site.calls.length, 1);
    await tick(ctx, T0 + 7 * HOUR + 16 * 60_000); // 16 minutes later -> due again
    assert.equal(ctx.site.calls.length, 2);
  });

  test('pollInterval grows with quiet time', () => {
    assert.equal(pollInterval(HOUR), 0);
    assert.equal(pollInterval(10 * HOUR), 15 * 60_000);
    assert.equal(pollInterval(5 * 24 * HOUR), 6 * HOUR);
  });

  test('followed players get their own alerts, named in the title', async () => {
    const ctx = await setup({
      follows: [
        { id: 'me', playerName: 'Suriyajan, Chayapol', isMe: true, tournaments: [{ id: '999' }] },
        { id: 'sam', playerName: 'Kantor, Sam', isMe: false, tournaments: [{ id: '999' }] },
      ],
    });
    await tick(ctx, T0);
    // The starting-rank list is fetched once and shared by both follows.
    assert.equal(ctx.site.calls.filter((c) => c.startsWith('rank:')).length, 1);

    ctx.site.rounds = [round(1), round(2)];
    await tick(ctx, T0 + 60_000);
    const titles = new Set(ctx.push.sent.map((p) => p.title));
    assert.ok(titles.has('RD 2 · BD 12'));
    assert.ok(titles.has('Kantor · RD 2 · BD 12'));
  });

  test('a player not in the list is remembered and not re-fetched every tick', async () => {
    const ctx = await setup({
      follows: [{ id: 'x', playerName: 'Carlsen, Magnus', isMe: true, tournaments: [{ id: '999' }] }],
    });
    await tick(ctx, T0);
    ctx.site.calls.length = 0;
    await tick(ctx, T0 + 60_000);
    assert.deepEqual(ctx.site.calls, []);
  });

  test('writes a feed the app can render', async () => {
    const ctx = await setup();
    ctx.site.rounds = [round(1), round(2)];
    await tick(ctx, T0);
    const feed = await ctx.store.get('feed');
    assert.equal(feed.follows[0].isMe, true);
    assert.equal(feed.follows[0].tournaments[0].title, 'Test Open 2026');
    assert.equal(feed.follows[0].tournaments[0].startNo, 7);
    assert.equal(feed.follows[0].tournaments[0].latestPaired.round, 2);
  });

  test('dry run sends nothing and writes nothing', async () => {
    const ctx = await setup();
    const result = await tick(ctx, T0, { dryRun: true });
    assert.equal(result.observed, 1);
    assert.equal(await ctx.store.get('feed'), null);
    assert.equal(await ctx.store.get('state'), null);
  });

  test('discovery failure is reported but pinned tournaments still poll', async () => {
    const ctx = await setup({
      follows: [{ id: 'me', playerName: 'Suriyajan, Chayapol', isMe: true, autoDiscover: true, tournaments: [{ id: '999' }] }],
    });
    ctx.site.fetchers.discoverTournaments = async () => {
      throw new Error('search page changed');
    };
    const result = await tick(ctx, T0);
    assert.equal(result.observed, 1);
    const feed = await ctx.store.get('feed');
    assert.equal(feed.follows[0].discoveryError, 'search page changed');
  });
});
