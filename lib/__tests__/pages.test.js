/**
 * Parser tests against REAL chess-results pages captured 2026-09-19:
 *  - real-*  : BCC Blitz 18 September 2026 (tnr1499564), finished, 31 players, 9 rounds
 *  - live-*  : Unisus The Street Open (tnr1486488), captured mid round 2 of 6
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parsePairings,
  parseStandings,
  parseCrosstable,
  parseCrossCell,
  parseSchedule,
  parseDetails,
  parseMenu,
  parsePlayerHeader,
  parseResult,
} from '../chessresults/pages.js';
import { parsePlayerCard } from '../chessresults/playercard.js';
import { parseStartingRank, findPlayer } from '../chessresults/tournament.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', '__fixtures__');
const fixture = (name) => readFileSync(join(FIXTURES, name), 'utf8');

describe('real player card (art=9)', () => {
  const rounds = parsePlayerCard(fixture('real-player-card.html'));

  test('reads all nine rounds, ignoring the page layout table and nested result tables', () => {
    assert.deepEqual(rounds.map((r) => r.round), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  test('reads board, opponent, rating and federation', () => {
    assert.deepEqual(
      { ...rounds[1] },
      {
        round: 2,
        board: 2,
        opponentNo: 2,
        opponent: 'Rohland, Michael Karl',
        rating: 1871,
        federation: 'CAN',
        colour: 'white',
        result: '0',
        paired: true,
      },
    );
  });

  test('reads colour from the FarbewT / FarbesT marker in the result cell', () => {
    assert.deepEqual(
      rounds.map((r) => r.colour[0]).join(''),
      'bwbwbwwbb',
    );
  });

  test('an unrated opponent has rating null, not 0', () => {
    assert.equal(rounds[0].opponent, 'Myat Kaung,');
    assert.equal(rounds[0].rating, null);
  });
});

describe('real starting rank (art=0)', () => {
  const players = parseStartingRank(fixture('real-starting-rank.html'));

  test('reads every player with FIDE ID', () => {
    assert.equal(players.length, 31);
    assert.deepEqual(players[11], {
      startNo: 12,
      name: 'Deeprasert, Fauzi',
      rating: 1559,
      federation: 'THA',
      fideId: '6214053',
    });
  });

  test('FIDE ID matching works on the real list', () => {
    assert.equal(findPlayer(players, { fideId: '6214053' }).player.startNo, 12);
  });
});

describe('parsePairings (art=2)', () => {
  const games = parsePairings(fixture('real-pairings-rd6.html'));

  test('reads boards with both players keyed by start number', () => {
    assert.equal(games[0].board, 1);
    assert.equal(games[0].white.startNo, 1);
    assert.equal(games[0].white.title, 'FM');
    assert.equal(games[0].black.startNo, 10);
    assert.equal(games[0].black.rating, 1664);
    assert.deepEqual(games[0].result, { white: 1, black: 0, forfeit: false });
  });

  test('marks byes and not-paired rows', () => {
    const bye = games.find((g) => g.bye);
    assert.equal(bye.white.startNo, 22);
    assert.equal(bye.black, null);
    assert.deepEqual(
      games.filter((g) => g.notPaired).map((g) => g.white.startNo),
      [25, 27],
    );
  });

  test('a round still being played has no results yet', () => {
    const live = parsePairings(fixture('live-pairings-rd2.html'));
    assert.ok(live.length >= 9);
    assert.ok(live.filter((g) => !g.bye && !g.notPaired).every((g) => g.result === null));
  });
});

describe('parseResult', () => {
  test('covers normal, drawn and forfeit results', () => {
    assert.deepEqual(parseResult('1 - 0'), { white: 1, black: 0, forfeit: false });
    assert.deepEqual(parseResult('½ - ½'), { white: 0.5, black: 0.5, forfeit: false });
    assert.deepEqual(parseResult('+ - -'), { white: 1, black: 0, forfeit: true });
    assert.deepEqual(parseResult('- - +'), { white: 0, black: 1, forfeit: true });
    assert.equal(parseResult(''), null);
  });
});

describe('parseStandings (art=1&rd=N)', () => {
  const rows = parseStandings(fixture('real-standings-rd5.html'));

  test('reads rank, start number and points', () => {
    assert.equal(rows.length, 31);
    assert.deepEqual(
      { rank: rows[0].rank, startNo: rows[0].startNo, points: rows[0].points, title: rows[0].title },
      { rank: 1, startNo: 1, points: 5, title: 'FM' },
    );
  });

  test('ranks are in order', () => {
    const ranks = rows.map((r) => r.rank);
    assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
  });
});

describe('parseCrosstable (art=5)', () => {
  const { rounds, players } = parseCrosstable(fixture('real-crosstable-final.html'));

  test('reads every player and round', () => {
    assert.equal(rounds, 9);
    assert.equal(players.length, 31);
  });

  test('games reference opponents by start number, consistently both ways', () => {
    const byNo = new Map(players.map((p) => [p.startNo, p]));
    for (const p of players) {
      for (const g of p.games) {
        if (g.opponent == null) continue;
        const back = byNo.get(g.opponent).games.find((x) => x.round === g.round);
        assert.equal(back.opponent, p.startNo, `round ${g.round}: ${p.startNo} vs ${g.opponent}`);
        assert.notEqual(back.colour, g.colour);
      }
    }
  });

  test('scores add up to the printed points', () => {
    for (const p of players) {
      const sum = p.games.reduce((s, g) => s + (g.score ?? 0), 0);
      assert.equal(sum, p.points, `player ${p.startNo}`);
    }
  });

  test('a live crosstable marks unfinished games as pending', () => {
    const live = parseCrosstable(fixture('live-crosstable-rd2.html'));
    assert.equal(live.rounds, 2);
    assert.deepEqual(live.players[0].games[1], { round: 2, opponent: 6, colour: 'white', score: null, kind: 'pending' });
  });
});

describe('parseCrossCell', () => {
  test('decodes every cell form seen on chess-results', () => {
    assert.deepEqual(parseCrossCell('17b1'), { opponent: 17, colour: 'black', score: 1, kind: 'game' });
    assert.deepEqual(parseCrossCell('7b½'), { opponent: 7, colour: 'black', score: 0.5, kind: 'game' });
    assert.deepEqual(parseCrossCell('6w'), { opponent: 6, colour: 'white', score: null, kind: 'pending' });
    assert.deepEqual(parseCrossCell('27b+'), { opponent: 27, colour: 'black', score: 1, kind: 'forfeit' });
    assert.deepEqual(parseCrossCell('18w-'), { opponent: 18, colour: 'white', score: 0, kind: 'forfeit' });
    assert.deepEqual(parseCrossCell('-1'), { opponent: null, colour: null, score: 1, kind: 'bye' });
    assert.deepEqual(parseCrossCell('-0'), { opponent: null, colour: null, score: 0, kind: 'absent' });
  });
});

describe('schedule, details, menu, player header', () => {
  test('parseSchedule normalises dates', () => {
    assert.deepEqual(parseSchedule(fixture('live-schedule.html'))[1], {
      round: 2,
      date: '2026-09-19',
      time: '12:50',
    });
  });

  test('parseDetails reads type and rounds from the crosstable page', () => {
    const details = parseDetails(fixture('real-crosstable-final.html'));
    assert.equal(details.format, 'swiss');
    assert.equal(details.rounds, 9);
    assert.equal(details.timeControl, '3min + 2sec/move');
  });

  test('parseMenu finds published rounds and the current round', () => {
    const live = parseMenu(fixture('live-crosstable-rd2.html'));
    assert.deepEqual(live.pairedRounds, [1, 2]);
    assert.equal(live.currentRound, 2);
    assert.equal(live.totalRounds, 6);
  });

  test('parsePlayerHeader reads the key facts', () => {
    const header = parsePlayerHeader(fixture('real-player-card.html'));
    assert.equal(header.name, 'Deeprasert, Fauzi');
    assert.equal(header.fideId, '6214053');
    assert.equal(header.performance, 1628);
    assert.equal(header.rank, 11);
  });
});
