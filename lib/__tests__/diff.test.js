import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { diffPairings, stateKey } from '../diff.js';
import { buildNotification, describePairing } from '../notify.js';

const observation = (rounds) => ({
  tournamentId: '999',
  tournamentTitle: 'Test Open 2026',
  url: 'https://chess-results.com/tnr999.aspx?lan=1&art=9&snr=2',
  startNo: 2,
  rounds,
});

const round = (n, extra = {}) => ({
  round: n,
  board: 10 + n,
  opponent: `Opponent ${n}`,
  rating: 2000 + n,
  colour: n % 2 ? 'white' : 'black',
  result: null,
  paired: true,
  ...extra,
});

describe('diffPairings', () => {
  test('a tournament seen for the first time is seeded silently', () => {
    const result = diffPairings({ players: {} }, [observation([round(1), round(2), round(3)])]);
    assert.equal(result.newPairings.length, 0, 'must not dump existing rounds on the lock screen');
    assert.deepEqual(result.seeded, ['999:2']);
    assert.deepEqual(result.nextState.players['999:2'].seenRounds, [1, 2, 3]);
  });

  test('a genuinely new round notifies exactly once', () => {
    const seeded = diffPairings({ players: {} }, [observation([round(1)])]).nextState;

    const first = diffPairings(seeded, [observation([round(1), round(2)])]);
    assert.equal(first.newPairings.length, 1);
    assert.equal(first.newPairings[0].round, 2);
    assert.equal(first.newPairings[0].board, 12);
    assert.equal(first.newPairings[0].tournamentTitle, 'Test Open 2026');

    // Polling again with no change must stay quiet.
    const second = diffPairings(first.nextState, [observation([round(1), round(2)])]);
    assert.equal(second.newPairings.length, 0);
  });

  test('byes and unpaired placeholders never notify', () => {
    const seeded = diffPairings({ players: {} }, [observation([round(1)])]).nextState;
    const result = diffPairings(seeded, [
      observation([round(1), round(2, { paired: false, opponent: null })]),
    ]);
    assert.equal(result.newPairings.length, 0);
    assert.deepEqual(result.nextState.players['999:2'].seenRounds, [1]);
  });

  test('state for a tournament missing from this run is preserved, not re-seeded', () => {
    // Simulates discovery being degraded: the tournament is not polled this time.
    const seeded = diffPairings({ players: {} }, [observation([round(1), round(2)])]).nextState;
    const skipped = diffPairings(seeded, []);
    assert.deepEqual(skipped.nextState.players['999:2'].seenRounds, [1, 2]);

    // When it comes back, previously seen rounds must not re-notify.
    const returned = diffPairings(skipped.nextState, [observation([round(1), round(2)])]);
    assert.equal(returned.newPairings.length, 0);
  });

  test('two tournaments are tracked independently', () => {
    const other = { ...observation([round(1)]), tournamentId: '1000' };
    const seeded = diffPairings({ players: {} }, [observation([round(1)]), other]).nextState;
    assert.equal(Object.keys(seeded.players).length, 2);

    const result = diffPairings(seeded, [
      observation([round(1), round(2)]),
      { ...other, rounds: [round(1)] },
    ]);
    assert.equal(result.newPairings.length, 1);
    assert.equal(result.newPairings[0].tournamentId, '999');
  });

  test('stateKey is stable', () => {
    assert.equal(stateKey('999', 2), '999:2');
  });
});

describe('notification text', () => {
  test('reads like a pairing card', () => {
    const notification = buildNotification({
      tournamentId: '999',
      tournamentTitle: 'Test Open 2026',
      round: 5,
      board: 12,
      opponent: 'Novák, Šimon',
      rating: 2145,
      colour: 'white',
      url: 'https://example.test',
    });
    assert.equal(notification.title, 'Round 5 — Board 12');
    assert.equal(notification.body, 'vs Novák, Šimon (2145) · White');
    assert.equal(notification.tag, '999-r5');
  });

  test('degrades gracefully when board, rating or colour are missing', () => {
    const notification = buildNotification({
      tournamentId: '999',
      round: 1,
      board: null,
      opponent: 'Someone',
      rating: null,
      colour: null,
    });
    assert.equal(notification.title, 'Round 1');
    assert.equal(notification.body, 'vs Someone');
  });

  test('describePairing includes federation when present', () => {
    assert.match(describePairing({ opponent: 'A', rating: 1500, federation: 'THA' }), /THA/);
  });
});
