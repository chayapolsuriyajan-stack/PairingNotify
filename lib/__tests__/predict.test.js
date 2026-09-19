import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseCrosstable, parseDetails } from '../chessresults/pages.js';
import { pairRound, backtest, colourPreference } from '../predict/swiss.js';
import { bergerRound, followsBerger } from '../predict/roundrobin.js';
import { forecast, trackRecord, outcomeOdds, detectFormat, mulberry32 } from '../predict/forecast.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', '__fixtures__');
const crosstable = (name) => parseCrosstable(readFileSync(join(FIXTURES, name), 'utf8'));

const blitz = crosstable('real-crosstable-final.html'); // 31 players, 9 rounds, many dropouts
const rapid = crosstable('real-crosstable-rapid.html'); // 65 players, 5 rounds
const live = crosstable('live-crosstable-rd2.html'); // round 2 of 6 in progress

describe('Berger round-robin tables', () => {
  const show = (games) => games.map((g) => `${g.white}-${g.black}`).sort().join(' ');

  test('match the FIDE table for 6 players', () => {
    const fide = ['1-6 2-5 3-4', '1-2 5-3 6-4', '2-6 3-1 4-5', '1-4 2-3 6-5', '3-6 4-2 5-1'];
    for (let round = 1; round <= 5; round++) {
      assert.equal(show(bergerRound(6, round)), fide[round - 1].split(' ').sort().join(' '), `round ${round}`);
    }
  });

  test('match the FIDE table for 4 players', () => {
    assert.equal(show(bergerRound(4, 1)), '1-4 2-3');
    assert.equal(show(bergerRound(4, 2)), '1-2 4-3');
    assert.equal(show(bergerRound(4, 3)), '2-4 3-1');
  });

  test('an odd field gives each player one bye (the dummy number)', () => {
    const byes = [1, 2, 3, 4, 5].map((r) => bergerRound(5, r).find((g) => g.white === 6 || g.black === 6));
    const byed = byes.map((g) => (g.white === 6 ? g.black : g.white)).sort();
    assert.deepEqual(byed, [1, 2, 3, 4, 5]);
  });

  test('the second cycle of a double round robin swaps colours', () => {
    assert.equal(show(bergerRound(4, 4)), '3-2 4-1');
  });

  test('a real Swiss event is not mistaken for a round robin', () => {
    assert.equal(followsBerger(blitz.players, blitz.rounds), false);
    assert.equal(detectFormat(rapid), 'swiss'); // rapid page has no details block
  });
});

describe('colourPreference', () => {
  test('follows FIDE C.04.1', () => {
    assert.deepEqual(colourPreference([]), { colour: null, strength: 0 });
    assert.deepEqual(colourPreference(['white']), { colour: 'black', strength: 2 });
    assert.deepEqual(colourPreference(['white', 'black']), { colour: 'white', strength: 1 });
    assert.deepEqual(colourPreference(['black', 'black']), { colour: 'white', strength: 3 });
    assert.deepEqual(colourPreference(['white', 'black', 'white', 'white']), { colour: 'black', strength: 3 });
  });
});

describe('Swiss pairing model', () => {
  for (const round of [2, 5, 9]) {
    test(`round ${round}: everyone plays at most once, no rematches, no absolute colour clash`, () => {
      const { games, bye } = pairRound(blitz.players, round);
      const seen = new Set(bye ? [bye] : []);
      const history = new Map(
        blitz.players.map((p) => [p.startNo, new Set(p.games.filter((g) => g.round < round).map((g) => g.opponent))]),
      );
      for (const { white, black } of games) {
        assert.ok(!seen.has(white) && !seen.has(black), `duplicate in ${white}-${black}`);
        seen.add(white);
        seen.add(black);
        assert.ok(!history.get(white).has(black), `rematch ${white}-${black}`);
      }
    });
  }

  test('the bye goes to a player who has not had one', () => {
    const { bye } = pairRound(blitz.players, 2);
    assert.equal(bye, 31); // the real round-2 bye
  });

  test('backtest: reproduces a useful share of real pairings (regression floor)', () => {
    // Measured 2026-09-19: blitz 45% (98/220), rapid 66% (156/238). Unannounced
    // absences and requested byes are unknowable, so 100% is not reachable.
    const b = backtest(blitz.players, 9);
    const r = backtest(rapid.players, 5);
    assert.ok(b.hits / b.total >= 0.4, `blitz ${b.hits}/${b.total}`);
    assert.ok(r.hits / r.total >= 0.6, `rapid ${r.hits}/${r.total}`);
  });
});

describe('forecast', () => {
  test('outcome odds are a probability distribution favouring the stronger player', () => {
    const odds = outcomeOdds(2200, 1800);
    assert.ok(Math.abs(odds.win + odds.draw + odds.loss - 1) < 1e-9);
    assert.ok(odds.win > 0.8);
    assert.equal(outcomeOdds(1500, 1500).draw, 0.3);
  });

  test('simulates the unfinished boards of a live round', () => {
    const f = forecast(live, { me: 3, totalRounds: 6, random: mulberry32(1) });
    assert.equal(f.status, 'simulated');
    assert.equal(f.targetRound, 3);
    assert.equal(f.boards, 9);
    assert.ok(f.candidates.length >= 3);
    const total = f.candidates.reduce((s, c) => s + c.probability, 0);
    assert.ok(total > 0.5 && total <= 1 + 1e-9);
    assert.ok(f.candidates.every((c, i, all) => i === 0 || all[i - 1].probability >= c.probability));
  });

  test('is reproducible with a seeded generator', () => {
    const a = forecast(live, { me: 3, random: mulberry32(7) });
    const b = forecast(live, { me: 3, random: mulberry32(7) });
    assert.deepEqual(a, b);
  });

  test('your own result changes who you are likely to meet', () => {
    const win = forecast(live, { me: 3, scenario: 'win', random: mulberry32(1) });
    const loss = forecast(live, { me: 3, scenario: 'loss', random: mulberry32(1) });
    const winners = new Set(win.candidates.map((c) => c.startNo));
    assert.ok(!loss.candidates.some((c) => winners.has(c.startNo)), 'win and loss lead to different score groups');
  });

  test('never proposes someone you already played', () => {
    const f = forecast(live, { me: 3, random: mulberry32(3) });
    const played = new Set(live.players.find((p) => p.startNo === 3).games.map((g) => g.opponent));
    assert.ok(f.candidates.every((c) => !played.has(c.startNo)));
  });

  test('knows when the event is over', () => {
    assert.equal(forecast(blitz, { me: 12, totalRounds: 9 }).status, 'finished');
  });

  test('trackRecord replays the event so far', () => {
    const record = trackRecord(blitz);
    assert.equal(record.rounds.length, 8);
    assert.equal(detectFormat(blitz, parseDetails(readFileSync(join(FIXTURES, 'real-crosstable-final.html'), 'utf8'))), 'swiss');
  });
});
