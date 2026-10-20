import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { createMemoryRaw } from '../store/memory.js';
import { readHealth, recordRun, watchdog, isStale } from '../health.js';

const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 20, 7, 0);

function inbox() {
  const sent = [];
  return { sent, notify: async (payload) => sent.push(payload.title) };
}

describe('poller health', () => {
  test('a run leaves a heartbeat; stale after five quiet minutes', async () => {
    const raw = createMemoryRaw();
    await recordRun(raw, { ok: true, now: T0 });
    const health = await readHealth(raw);
    assert.equal(health.lastRunAt, T0);
    assert.equal(isStale(health, T0 + 4 * MIN), false);
    assert.equal(isStale(health, T0 + 6 * MIN), true);
  });

  test('the owner is told once per outage, and again when it recovers', async () => {
    const raw = createMemoryRaw();
    const box = inbox();
    await recordRun(raw, { ok: true, now: T0 });

    assert.equal(await watchdog(raw, { now: T0 + 8 * MIN, notify: box.notify }), 'ok', 'cron retries get time');
    assert.equal(await watchdog(raw, { now: T0 + 11 * MIN, notify: box.notify }), 'alerted');
    assert.equal(await watchdog(raw, { now: T0 + 30 * MIN, notify: box.notify }), 'already-alerted');
    assert.deepEqual(box.sent, ['Alerts paused']);

    await recordRun(raw, { ok: true, now: T0 + 40 * MIN, notify: box.notify });
    assert.deepEqual(box.sent, ['Alerts paused', 'Alerts are back on']);

    // A later outage is a new one.
    assert.equal(await watchdog(raw, { now: T0 + 60 * MIN, notify: box.notify }), 'alerted');
  });

  test('a failed run is recorded but still counts as the poller being alive', async () => {
    const raw = createMemoryRaw();
    await recordRun(raw, { ok: false, error: 'Redis timeout', now: T0 });
    const health = await readHealth(raw);
    assert.equal(health.lastError, 'Redis timeout');
    assert.equal(health.lastOkAt, null);
    assert.equal(isStale(health, T0 + MIN), false);
  });

  test('a fresh install that never polled is not an outage', async () => {
    const box = inbox();
    assert.equal(await watchdog(createMemoryRaw(), { now: T0, notify: box.notify }), 'never-ran');
    assert.deepEqual(box.sent, []);
  });
});
