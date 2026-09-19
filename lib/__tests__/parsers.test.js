import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parsePlayerCard } from '../chessresults/playercard.js';
import { parseStartingRank, findPlayer, normaliseName } from '../chessresults/tournament.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', '__fixtures__');
const fixture = (name) => readFileSync(join(FIXTURES, name), 'utf8');

describe('parsePlayerCard', () => {
  const rounds = parsePlayerCard(fixture('synthetic-player-card.html'));

  test('reads every round row', () => {
    assert.equal(rounds.length, 4);
    assert.deepEqual(rounds.map((r) => r.round), [1, 2, 3, 4]);
  });

  test('extracts board, opponent and rating - the three things a notification needs', () => {
    const round4 = rounds.find((r) => r.round === 4);
    assert.equal(round4.board, 12);
    assert.equal(round4.opponent, 'Novák, Šimon');
    assert.equal(round4.rating, 2145);
    assert.equal(round4.federation, 'CZE');
  });

  test('reads colour from the glyph column, including the German "s"', () => {
    assert.equal(rounds.find((r) => r.round === 1).colour, 'white');
    assert.equal(rounds.find((r) => r.round === 2).colour, 'black');
  });

  test('a bye is recorded but never counts as paired', () => {
    const bye = rounds.find((r) => r.round === 3);
    assert.equal(bye.paired, false);
    assert.equal(bye.opponent, null);
  });

  test('throws loudly rather than returning nothing when the markup changes', () => {
    assert.throws(
      () => parsePlayerCard('<html><body><table><tr><td>nothing here</td></tr></table></body></html>'),
      /No table found/,
    );
  });
});

describe('parseStartingRank / findPlayer', () => {
  const players = parseStartingRank(fixture('synthetic-starting-rank.html'));

  test('reads the whole list', () => {
    assert.equal(players.length, 4);
    assert.deepEqual(players[1], {
      startNo: 2,
      name: 'Suriyajan, Chayapol',
      rating: 1980,
      federation: 'THA',
      fideId: '6200456',
    });
  });

  test('FIDE ID wins over the name', () => {
    const match = findPlayer(players, { playerName: 'Novak, Jan', fideId: '6200456' });
    assert.equal(match.matchedBy, 'fideId');
    assert.equal(match.player.startNo, 2);
  });

  test('matches a name regardless of word order and punctuation', () => {
    assert.equal(findPlayer(players, { playerName: 'Chayapol Suriyajan' }).player.startNo, 2);
  });

  test('refuses to guess between two players sharing a surname', () => {
    assert.throws(() => findPlayer(players, { playerName: 'Novak' }), /matches 2 players|Set "fideId"/);
  });

  test('returns null when the player simply is not in the tournament', () => {
    assert.equal(findPlayer(players, { playerName: 'Carlsen, Magnus' }), null);
  });

  test('normaliseName folds accents', () => {
    assert.equal(normaliseName('Novák, Šimon'), 'novak simon');
  });
});
