import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { diffPairings } from '../diff.js';
import { buildResultNotification, outcomeOf, LINES, QUOTES } from '../messages.js';
import { DEFAULT_SETTINGS, mergeSettings, normaliseSettings } from '../settings.js';
import { dueReminders, zonedTime } from '../reminders.js';
import { runPoll } from '../poll.js';
import { createMemoryStore } from '../store/memory.js';

const MIN = 60_000;
const settings = (patch = {}) => mergeSettings(DEFAULT_SETTINGS, { timeZone: 'Asia/Bangkok', ...patch });
const obs = (rounds) => [{ tournamentId: '9', tournamentTitle: 'Open', startNo: 7, isMe: true, rounds }];
const r = (round, result = null, extra = {}) => ({
  round,
  board: round,
  opponent: `Rival, No${round}`,
  rating: 2000,
  colour: 'white',
  result,
  paired: true,
  ...extra,
});

describe('result alerts', () => {
  test('outcome from the result cell; forfeits are not games', () => {
    assert.equal(outcomeOf('1'), 'win');
    assert.equal(outcomeOf('½'), 'draw');
    assert.equal(outcomeOf('0,5'), 'draw');
    assert.equal(outcomeOf('0'), 'loss');
    assert.equal(outcomeOf('+'), null);
    assert.equal(outcomeOf('-'), null);
    assert.equal(outcomeOf(null), null);
  });

  test('a result that appears is new once; seeding and corrections stay quiet', () => {
    const seed = diffPairings({ players: {} }, obs([r(1, '1'), r(2)]));
    assert.equal(seed.newResults.length, 0, 'first sight is silent');

    const next = diffPairings(seed.nextState, obs([r(1, '1'), r(2, '½')]));
    assert.deepEqual(next.newResults.map((x) => [x.round, x.result]), [[2, '½']]);

    const corrected = diffPairings(next.nextState, obs([r(1, '1'), r(2, '0')]));
    assert.equal(corrected.newResults.length, 0);
  });

  test('state from before results were tracked does not announce old results', () => {
    const old = { players: { '9:7': { tournamentId: '9', startNo: 7, seenRounds: [1, 2] } } };
    assert.equal(diffPairings(old, obs([r(1, '1'), r(2, '0')])).newResults.length, 0);
  });

  test('a bye is never a result alert', () => {
    const seed = diffPairings({ players: {} }, obs([r(1)]));
    const bye = diffPairings(seed.nextState, obs([r(1, '1', { paired: false, opponent: null })]));
    assert.equal(bye.newResults.length, 0);
  });

  test('copy: outcome and opponent in the title, a line underneath, same line every time', () => {
    const item = { tournamentId: '9', startNo: 7, isMe: true, ...r(5, '1') };
    const a = buildResultNotification(item, settings());
    assert.equal(a.title, 'RD 5 · WIN vs Rival, No5');
    assert.ok(LINES.win.includes(a.body));
    assert.equal(buildResultNotification(item, settings()).body, a.body);

    const q = buildResultNotification(item, settings({ results: { style: 'quotes' } }));
    assert.ok(QUOTES.win.some(([text, who]) => q.body === `“${text}” — ${who}`));

    const c = buildResultNotification(item, settings({ results: { style: 'custom', custom: { win: 'GG!' } } }));
    assert.equal(c.body, 'GG!');
  });

  test('followed players are named in full; switches are respected', () => {
    const item = { tournamentId: '9', startNo: 7, isMe: false, playerName: 'Kantor, Sam', ...r(2, '0') };
    assert.equal(buildResultNotification(item, settings()).title, 'Kantor, Sam · RD 2 · LOSS vs Rival, No2');
    assert.equal(buildResultNotification(item, settings({ results: { loss: false } })), null);
    assert.equal(buildResultNotification(item, settings({ results: { followed: false } })), null);
  });

  test('settings drop anything invalid', () => {
    const s = normaliseSettings({ results: { style: 'shout', win: 'yes' }, reminder: { minutes: 7 }, timeZone: 'Mars/Base' });
    assert.equal(s.results.style, 'lines');
    assert.equal(s.results.win, true);
    assert.equal(s.reminder.minutes, 30);
    assert.equal(s.timeZone, null);
  });
});

describe('round reminders', () => {
  test('local schedule times are read in the account time zone', () => {
    assert.equal(zonedTime('2026-09-19', '15:35', 'Asia/Bangkok'), Date.UTC(2026, 8, 19, 8, 35));
    assert.equal(zonedTime('2026-03-29', '12:00', 'Europe/Vienna'), Date.UTC(2026, 2, 29, 10, 0), 'after DST starts');
    assert.equal(zonedTime(null, '12:00'), null);
  });

  const at = Date.UTC(2026, 8, 19, 8, 35);
  const item = (rounds = []) => ({
    follow: { isMe: true, playerName: 'Me, Myself' },
    tournamentId: '9',
    title: 'Open',
    startNo: 7,
    rounds,
    schedule: [{ round: 6, date: '2026-09-19', time: '15:35', at }],
  });

  test('due inside the window, with the pairing when it is out', () => {
    const [due] = dueReminders({ items: [item([r(6)])], settings: settings(), sent: {}, now: at - 28 * MIN });
    assert.equal(due.payload.title, '28 MIN · RD 6 · 15:35');
    assert.equal(due.payload.body, 'BD 6 · vs Rival, No6 (2000) · WHITE');
    const [early] = dueReminders({ items: [item()], settings: settings(), sent: {}, now: at - 10 * MIN });
    assert.equal(early.payload.body, 'Pairings not out yet');
  });

  test('not before the window, not after the start, not twice, not without a time zone', () => {
    const run = (now, extra = {}) =>
      dueReminders({ items: [item()], settings: settings(extra.settings), sent: extra.sent ?? {}, now }).length;
    assert.equal(run(at - 31 * MIN), 0);
    assert.equal(run(at + MIN), 0);
    assert.equal(run(at - 5 * MIN, { sent: { '9:7:6': at - 30 * MIN } }), 0);
    assert.equal(run(at - 5 * MIN, { settings: { reminder: { on: false } } }), 0);
    assert.equal(run(at - 50 * MIN, { settings: { reminder: { minutes: 60 } } }), 1);
    assert.equal(
      dueReminders({ items: [item()], settings: normaliseSettings({}), sent: {}, now: at - 5 * MIN }).length,
      0,
      'no time zone yet: times could be hours off',
    );
  });

  test('followed players only when asked', () => {
    const theirs = { ...item(), follow: { isMe: false, playerName: 'Kantor, Sam' } };
    const now = at - 5 * MIN;
    assert.equal(dueReminders({ items: [theirs], settings: settings(), sent: {}, now }).length, 0);
    const [due] = dueReminders({ items: [theirs], settings: settings({ reminder: { followed: true } }), sent: {}, now });
    assert.equal(due.payload.title, 'Kantor, Sam · 5 MIN · RD 6 · 15:35');
  });

  test('end to end: the poller reads the schedule, reminds once, and announces the result', async () => {
    const store = createMemoryStore();
    await store.saveFollow({ id: 'me', playerName: 'Me, Myself', isMe: true, tournaments: [{ id: '9' }] });
    await store.saveSubscription({ endpoint: 'https://push/phone', keys: {} });
    await store.set('settings', settings());
    let rounds = [r(5, '1'), r(6)];
    const calls = [];
    const fetchers = {
      discoverTournaments: async () => [],
      fetchStartingRank: async () => ({ title: 'Open', players: [{ startNo: 7, name: 'Me, Myself' }] }),
      fetchPlayerCard: async () => ({ title: 'Open', rounds }),
      fetchSchedule: async () => {
        calls.push('schedule');
        return [{ round: 6, date: '2026-09-19', time: '15:35' }];
      },
    };
    const sent = [];
    const sender = async (_sub, body) => sent.push(JSON.parse(body).title);
    const tick = (now) => runPoll({ store, fetchers, sender, vapid: null, now, log: () => {} });

    await tick(at - 3 * 60 * MIN); // seeds, reads the schedule
    await tick(at - 25 * MIN);
    await tick(at - 24 * MIN);
    rounds = [r(5, '1'), r(6, '½')];
    await tick(at + 90 * MIN);

    assert.deepEqual(sent, ['25 MIN · RD 6 · 15:35', 'RD 6 · DRAW vs Rival, No6']);
    assert.equal(calls.length, 1, 'schedule read once, not every tick');
  });
});
