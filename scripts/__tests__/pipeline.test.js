/**
 * End-to-end wiring test: starting rank -> player match -> player card -> diff ->
 * notification payload, with fetch stubbed to serve fixtures.
 *
 * This does not prove the parsers match live chess-results markup (only the capture
 * workflow can), but it does prove the pieces are connected correctly.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchStartingRank } from '../chessresults/tournament.js';
import { fetchPlayerCard } from '../chessresults/playercard.js';
import { findPlayer } from '../chessresults/tournament.js';
import { diffPairings } from '../diff.js';
import { buildNotification } from '../notify.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', '__fixtures__');
const fixture = (name) => readFileSync(join(FIXTURES, name), 'utf8');

const realFetch = globalThis.fetch;
const requested = [];

before(() => {
  globalThis.fetch = async (url) => {
    requested.push(String(url));
    const body = String(url).includes('art=9')
      ? fixture('synthetic-player-card.html')
      : fixture('synthetic-starting-rank.html');
    return new Response(body, { status: 200, headers: { 'Content-Type': 'text/html' } });
  };
});

after(() => {
  globalThis.fetch = realFetch;
});

describe('poll pipeline', () => {
  test('resolves a player and turns a new round into a notification', async () => {
    const { title, players } = await fetchStartingRank('999');
    assert.match(title, /Test Open 2026/);

    const match = findPlayer(players, { playerName: 'Suriyajan, Chayapol' });
    assert.equal(match.player.startNo, 2);

    const { rounds } = await fetchPlayerCard('999', match.player.startNo);
    const observation = {
      tournamentId: '999',
      tournamentTitle: title,
      url: 'https://chess-results.com/tnr999.aspx?lan=1&art=9&snr=2',
      startNo: match.player.startNo,
      rounds,
    };

    // First poll seeds silently...
    const seed = diffPairings({ players: {} }, [observation]);
    assert.equal(seed.newPairings.length, 0);

    // ...then round 4 arriving fresh produces exactly one push.
    const before = structuredClone(seed.nextState);
    before.players['999:2'].seenRounds = [1, 2];
    const result = diffPairings(before, [observation]);

    assert.equal(result.newPairings.length, 1);
    const notification = buildNotification(result.newPairings[0]);
    assert.equal(notification.title, 'Round 4 — Board 12');
    assert.equal(notification.body, 'vs Novák, Šimon (2145) · White · CZE');
  });

  test('requests the expected chess-results URLs', () => {
    assert.ok(requested.some((url) => /tnr999\.aspx\?.*art=1/.test(url)), 'starting rank');
    assert.ok(requested.some((url) => /tnr999\.aspx\?.*art=9.*snr=2/.test(url)), 'player card');
  });
});
