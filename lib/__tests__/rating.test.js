import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { expectedScore, ratingChanges } from '../rating.js';

const r = (round, rating, result, paired = true) => ({ round, rating, result, paired });

describe('FIDE rating change', () => {
  test('expected score: even at equal ratings, capped at a 400-point gap', () => {
    assert.equal(expectedScore(2000, 2000), 0.5);
    assert.ok(Math.abs(expectedScore(2000, 1800) - 0.76) < 0.01);
    assert.equal(expectedScore(2000, 1000), expectedScore(2000, 1600));
  });

  test('per game and in total, with the usual K when no official total is known', () => {
    const out = ratingChanges([r(1, 2000, '1'), r(2, 2000, '½'), r(3, 2000, '0')], { rating: 2000 });
    assert.deepEqual(out.games.map((g) => g.change), [10, 0, -10]);
    assert.equal(out.total, 0);
    assert.equal(out.k, 20);
    assert.equal(out.kFrom, 'default');
  });

  test('unrated opponents, forfeits, byes and pending games change nothing', () => {
    const out = ratingChanges(
      [r(1, null, '1'), r(2, 1900, '+'), r(3, null, '1', false), r(4, 1900, null)],
      { rating: 2000 },
    );
    assert.deepEqual(out.games, []);
    assert.equal(ratingChanges([r(1, 1900, '1')], { rating: null }), null, 'unrated player');
  });

  test('the published total wins: games are scaled to add up to it, and K read back', () => {
    const rounds = [r(1, 1800, '0'), r(2, 1900, '0')];
    const out = ratingChanges(rounds, { rating: 2000, official: -50.8 });
    assert.equal(out.k, 40);
    assert.equal(out.kFrom, 'official');
    assert.equal(out.total, -50.8);
    const sum = out.games.reduce((s, g) => s + g.change, 0);
    assert.ok(Math.abs(sum - -50.8) <= 0.1, `games add up to ${sum}`);
    assert.ok(out.games[0].change < out.games[1].change, 'losing to the lower-rated player costs more');

    const odd = ratingChanges(rounds, { rating: 2000, official: -3 });
    assert.equal(odd.k, 20, 'a total that fits no K value keeps the usual K label');
    assert.equal(odd.total, -3);
  });
});
