/**
 * The Lichess study renamer. The fixture reproduces the shape of a real study export
 * (no [White]/[Black], `[Result "*"]` everywhere, "<Study>: <Chapter>" event names) and
 * the nine-round example from the brief, with moves that carry comments, variations
 * and NAGs, because the point of the tool is to change names and nothing else.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyRenames,
  cleanTagValue,
  formatName,
  missingFields,
  planGames,
  readGame,
  renameStudy,
  renderName,
  splitGames,
} from '../pgn/study.js';
import { parseChessResultsRows, parseRow, scoreFromPoints } from '../pgn/rows.js';

const STUDY = 'Lumpoon 2026';

/** One study-export game. `moves` is the movetext, `extra` more tag lines. */
function studyGame({ chapter, event = `${STUDY}: ${chapter}`, moves, extra = [] }) {
  return [
    `[Event "${event}"]`,
    '[Date "2026.09.05"]',
    '[Result "*"]',
    `[StudyName "${STUDY}"]`,
    `[ChapterName "${chapter}"]`,
    '[ChapterURL "https://lichess.org/study/AbCdEfGh/IjKlMnOp"]',
    '[Annotator "https://lichess.org/@/example"]',
    '[UTCDate "2026.09.19"]',
    '[UTCTime "07:51:17"]',
    ...extra,
    '',
    moves,
    '',
    '',
  ].join('\n');
}

const RUY = '1. e4 e5 2. Nf3 { Develops with tempo. } (2. f4 $5 exf4 { King\'s Gambit }) 2... Nc6 3. Bb5 $1 a6';

/** The nine chapters of the brief, in file order. */
const CHAPTERS = [
  { chapter: 'Nachanop 1-0', moves: `${RUY} 4. Ba4 { 1-0 } 1-0` },
  { chapter: 'Viriya 1-0', moves: `${RUY} *` },
  { chapter: 'Weera', moves: `${RUY} 4. Bxc6 dxc6 { 1-0 } *` }, // no score in the name, result comment at the end
  { chapter: 'Kamonhat 0-1', moves: `${RUY} *` },
  { chapter: 'Meesiri 1-0', moves: `${RUY} *` },
  { chapter: 'Wcm ploy', moves: `${RUY} *` },
  { chapter: 'Chapter 7', moves: `${RUY} *` },
  { chapter: 'Grunfeld', moves: '1. d4 Nf6 2. c4 g6 3. Nc3 d5 *' },
  { chapter: 'Chapter 9', moves: '1. c4 e5 2. Nc3 Nf6 *' },
];
const STUDY_PGN = CHAPTERS.map(studyGame).join('');

/** The rows of the brief, as short as chess-results rows get. */
const SHORT_ROWS = [
  'Ninpattanangkul, Nachanop 1',
  'Viriya, A-Nak 1',
  'Weera, Ackkharawin 1',
  'Kamonhat, Tumpapon 0',
  'Meesiri, Nichakon 1',
  'WCM Khantree, Napat 0',
  'Pantong, Tikampon 0',
  'Sophai, Mondanai 1',
  'Weerapan, Phumrapee 0',
].join('\n');

/** The same rows as a browser copies them: Rd, Bo, SNo, title, Name, Rtg, FED, Pts, Res. */
const TAB_ROWS = [
  '1\t3\t12\t\tNinpattanangkul, Nachanop\t1450\tTHA\t0\t1',
  '2\t2\t7\t\tViriya, A-Nak\t1520\tTHA\t1\t1',
  '3\t4\t9\t\tWeera, Ackkharawin\t0\tTHA\t1,5\t1',
  '4\t1\t3\t\tKamonhat, Tumpapon\t1710\tTHA\t2\t0',
  '5\t6\t15\t\tMeesiri, Nichakon\t1380\tTHA\t2\t1',
  '6\t5\t11\tWCM\tKhantree, Napat\t1605\tTHA\t3,5\t0',
  '7\t2\t4\t\tPantong, Tikampon\t1490\tTHA\t3\t0',
  '8\t7\t14\t\tSophai, Mondanai\t1330\tTHA\t3\t1',
  '9\t3\t6\t\tWeerapan, Phumrapee\t1560\tTHA\t4\t0',
].join('\n');

const EXPECTED = [
  'Nachanop Ninpattanangkul 1-0',
  'A-Nak Viriya 1-0',
  'Ackkharawin Weera 1-0',
  'Tumpapon Kamonhat 0-1',
  'Nichakon Meesiri 1-0',
  'Napat Khantree 0-1',
  'Tikampon Pantong 0-1',
  'Mondanai Sophai 1-0',
  'Phumrapee Weerapan 0-1',
];

const eventNames = (pgn) => [...pgn.matchAll(/^\[Event "(.*)"\]/gm)].map((m) => m[1]);
const chapterNames = (pgn) => [...pgn.matchAll(/^\[ChapterName "(.*)"\]/gm)].map((m) => m[1]);

function rename(pgn, { rowsText = '', username = '', ...options } = {}) {
  const { rows } = parseChessResultsRows(rowsText);
  const plan = planGames(pgn, { username, rows, nameOrder: options.nameOrder });
  return { plan, ...renameStudy(pgn, plan.entries, options) };
}

/**
 * Everything except the [Event] and [ChapterName] lines must come out byte-identical.
 * This does not use the code under test to find the lines: it compares raw lines.
 */
function assertOnlyNamesChanged(input, output) {
  const before = input.split(/(?<=\n)/);
  const after = output.split(/(?<=\n)/);
  assert.equal(after.length, before.length, 'same number of lines');
  before.forEach((line, i) => {
    if (/^\[(?:Event|ChapterName) "/.test(line)) {
      assert.match(after[i], /^\[(?:Event|ChapterName) "[^"\\]*"\]\r?\n?$/, `line ${i + 1} keeps the exact tag format`);
      assert.equal(after[i].replace(/^\[\w+ "[^"]*"\]/, ''), line.replace(/^\[\w+ "[^"]*"\]/, ''), `line ${i + 1} ends as it did`);
    } else {
      assert.equal(after[i], line, `line ${i + 1} is untouched`);
    }
  });

  // And re-reading both sides agrees on every other tag and on the moves.
  const a = splitGames(input);
  const b = splitGames(output);
  assert.equal(b.preamble, a.preamble);
  assert.equal(b.games.length, a.games.length);
  a.games.forEach((chunk, i) => {
    const x = readGame(chunk);
    const y = readGame(b.games[i]);
    const { Event: _e1, ChapterName: _c1, ...restIn } = x.tags;
    const { Event: _e2, ChapterName: _c2, ...restOut } = y.tags;
    assert.deepEqual(restOut, restIn, `game ${i + 1}: other tags`);
    assert.equal(y.movetext, x.movetext, `game ${i + 1}: movetext`);
  });
}

describe('the nine-round example from the brief', () => {
  for (const [label, rowsText] of [
    ['short rows ("Surname, Given 1")', SHORT_ROWS],
    ['rows copied from the page (tab-separated)', TAB_ROWS],
  ]) {
    test(`names all nine chapters from ${label}`, () => {
      const { text, plan } = rename(STUDY_PGN, { rowsText });
      assert.deepEqual(eventNames(text), EXPECTED);
      assert.deepEqual(plan.warnings, []);
    });
  }

  test('also renames [ChapterName] by default, and leaves it alone when asked', () => {
    const on = rename(STUDY_PGN, { rowsText: SHORT_ROWS }).text;
    assert.deepEqual(chapterNames(on), EXPECTED);
    const off = rename(STUDY_PGN, { rowsText: SHORT_ROWS, updateChapterName: false }).text;
    assert.deepEqual(chapterNames(off), CHAPTERS.map((c) => c.chapter));
    assert.deepEqual(eventNames(off), EXPECTED);
  });

  test('without chess-results, only what the PGN itself says is filled in', () => {
    const { plan, names } = rename(STUDY_PGN);
    const bySource = plan.entries.map((e) => [e.opponent, e.score, e.opponentFrom, e.scoreFrom]);
    assert.deepEqual(bySource[0], ['Nachanop', '1-0', 'name', 'name']);
    assert.deepEqual(bySource[1], ['Viriya', '1-0', 'name', 'name']);
    // Weera: the score is in a result comment, but nothing names the opponent.
    assert.deepEqual(bySource[2], ['', '1-0', '', 'comment']);
    assert.deepEqual(bySource[3], ['Kamonhat', '0-1', 'name', 'name']);
    assert.deepEqual(bySource[4], ['Meesiri', '1-0', 'name', 'name']);
    for (const i of [2, 5, 6, 7, 8]) assert.equal(names[i], null, `game ${i + 1} is flagged, not guessed`);
  });

  test('a chess-results name replaces the partial one in the chapter title', () => {
    const { plan } = rename(STUDY_PGN, { rowsText: SHORT_ROWS });
    assert.equal(plan.entries[1].opponent, 'A-Nak Viriya');
    assert.equal(plan.entries[1].opponentFrom, 'chess-results');
  });

  test('"Last, First" can be kept as chess-results writes it', () => {
    const { text } = rename(STUDY_PGN, { rowsText: SHORT_ROWS, nameOrder: 'last-first' });
    assert.equal(eventNames(text)[1], 'Viriya, A-Nak 1-0');
    assert.equal(eventNames(text)[5], 'Khantree, Napat 0-1');
  });

  test('moves and every other tag are provably unchanged (LF)', () => {
    assertOnlyNamesChanged(STUDY_PGN, rename(STUDY_PGN, { rowsText: SHORT_ROWS }).text);
  });

  test('moves and every other tag are provably unchanged (CRLF)', () => {
    const crlf = STUDY_PGN.replace(/\n/g, '\r\n');
    const out = rename(crlf, { rowsText: SHORT_ROWS }).text;
    assertOnlyNamesChanged(crlf, out);
    assert.ok(!/(?<!\r)\n/.test(out), 'no bare LF appeared');
    assert.deepEqual(eventNames(out.replace(/\r/g, '')), EXPECTED);
  });

  test('with no names to apply, the PGN comes back exactly as it went in', () => {
    const crlf = STUDY_PGN.replace(/\n/g, '\r\n');
    assert.equal(applyRenames(STUDY_PGN, []), STUDY_PGN);
    assert.equal(applyRenames(STUDY_PGN, [null, '', undefined]), STUDY_PGN);
    assert.equal(applyRenames(crlf, []), crlf);
  });
});

describe('games with [White]/[Black]', () => {
  const tagged = (white, black, result, moves = '1. e4 e5 *') =>
    `[Event "Club night"]\n[White "${white}"]\n[Black "${black}"]\n[Result "${result}"]\n\n${moves}\n\n`;

  test('names a game from the tags and my username, no chess-results needed', () => {
    const pgn = [
      tagged('ChaYapol', 'Somchai P', '1-0'),
      tagged('Nok', 'chayapol', '1-0'), // I had Black and White won
      tagged('chayapol', 'Anan K', '1/2-1/2'),
      tagged('Dao', 'chayapol', '1/2-1/2'),
      tagged('chayapol', 'Preecha', '0-1'),
    ].join('');
    const { text } = rename(pgn, { username: 'CHAYAPOL' });
    assert.deepEqual(eventNames(text), [
      'Somchai P 1-0',
      'Nok 0-1',
      'Anan K 1/2-1/2',
      'Dao 1/2-1/2',
      'Preecha 0-1',
    ]);
    assertOnlyNamesChanged(pgn, text);
  });

  test('a "*" result is ignored but the opponent still counts', () => {
    const pgn = tagged('chayapol', 'Somchai P', '*', '1. e4 e5 2. Nf3 { 1-0 } *');
    const { plan, text } = rename(pgn, { username: 'chayapol' });
    assert.deepEqual(
      [plan.entries[0].opponent, plan.entries[0].score, plan.entries[0].scoreFrom],
      ['Somchai P', '1-0', 'comment'],
    );
    assert.deepEqual(eventNames(text), ['Somchai P 1-0']);
  });

  test('without my username the tags cannot say which side I was', () => {
    const { names } = rename(tagged('chayapol', 'Somchai P', '1-0'));
    assert.deepEqual(names, [null]);
  });

  test('a game where both players are "me" is left to the other sources', () => {
    const { names } = rename(tagged('chayapol', 'chayapol', '1-0'), { username: 'chayapol' });
    assert.deepEqual(names, [null]);
  });

  test('"Surname, Given" in a tag follows the name-order option', () => {
    const pgn = tagged('chayapol', 'Viriya, A-Nak', '1-0');
    assert.deepEqual(eventNames(rename(pgn, { username: 'chayapol' }).text), ['A-Nak Viriya 1-0']);
    assert.deepEqual(eventNames(rename(pgn, { username: 'chayapol', nameOrder: 'last-first' }).text), ['Viriya, A-Nak 1-0']);
  });
});

describe('reading the existing name and result comment', () => {
  const one = (chapter, moves = '1. e4 e5 *', event) =>
    studyGame({ chapter, event: event ?? `${STUDY}: ${chapter}`, moves });
  const plan1 = (pgn) => planGames(pgn).entries[0];

  test('strips the "<StudyName>: " prefix before reading "<name> <score>"', () => {
    const e = plan1(one('Viriya 1-0'));
    assert.deepEqual([e.opponent, e.score], ['Viriya', '1-0']);
  });

  test('falls back to the [Event] tag when the chapter name says nothing', () => {
    const e = plan1(one('Chapter 1', '1. e4 *', `${STUDY}: Somchai 0-1`));
    assert.deepEqual([e.opponent, e.score], ['Somchai', '0-1']);
  });

  test('reads its own parenthesised output back', () => {
    const e = plan1(one('(Viriya) 1/2-1/2'));
    assert.deepEqual([e.opponent, e.score], ['Viriya', '1/2-1/2']);
  });

  test('"½-½" is a draw', () => {
    assert.equal(plan1(one('Viriya ½-½')).score, '1/2-1/2');
  });

  test('a result comment counts only at the very end of the moves', () => {
    assert.equal(plan1(one('x', '1. e4 { 1-0 } e5 2. Nf3 *')).score, '', 'mid-game comment ignored');
    assert.equal(plan1(one('x', '1. e4 e5 { 0-1 } *')).score, '0-1');
    assert.equal(plan1(one('x', '1. e4 e5 {1/2-1/2}')).score, '1/2-1/2', 'no space, no result marker');
    assert.equal(plan1(one('x', '1. e4 e5 { good game 1-0 } *')).score, '', 'only a bare result');
  });

  test('sources that disagree are flagged, not silently resolved', () => {
    const { entries } = rename(one('Viriya 1-0'), { rowsText: 'Viriya, A-Nak 0' }).plan;
    assert.equal(entries[0].score, '0-1', 'chess-results outranks the chapter name');
    assert.match(entries[0].notes.join(' '), /disagree on the score/);
  });

  test('a chess-results row that is clearly another player is flagged', () => {
    const { entries } = rename(one('Viriya 1-0'), { rowsText: 'Tumpapon, Kamonhat 1' }).plan;
    assert.match(entries[0].notes.join(' '), /chess-results row 1/);
  });
});

describe('splitting and rewriting', () => {
  test('games are cut at [Event " lines, whatever the blank lines look like', () => {
    const a = '[Event "A 1-0"]\n[Result "*"]\n\n1. e4 *\n[Event "B 0-1"]\n[Result "*"]\n1. d4 *\n\n\n\n[Event "C 1/2-1/2"]\n\n1. c4 *';
    const { games, preamble } = splitGames(a);
    assert.equal(games.length, 3);
    assert.equal(preamble, '');
    assert.equal(preamble + games.join(''), a);
    assert.deepEqual(eventNames(rename(a).text), ['A 1-0', 'B 0-1', 'C 1/2-1/2']);
  });

  test('text before the first game is kept untouched', () => {
    const pgn = `% exported by hand\n\n${studyGame({ chapter: 'Viriya 1-0', moves: '1. e4 *' })}`;
    const { preamble } = splitGames(pgn);
    assert.equal(preamble, '% exported by hand\n\n');
    assertOnlyNamesChanged(pgn, rename(pgn).text);
  });

  test('empty and game-less input is returned as it came', () => {
    assert.equal(applyRenames('', []), '');
    assert.equal(applyRenames('no games here\n', ['x']), 'no games here\n');
    assert.deepEqual(planGames('').entries, []);
  });

  test('a game without a [ChapterName] tag does not gain one', () => {
    const pgn = '[Event "Viriya 1-0"]\n[Result "*"]\n\n1. e4 *\n';
    const { text } = rename(pgn, { rowsText: 'Viriya, A-Nak 1' });
    assert.equal(text, '[Event "A-Nak Viriya 1-0"]\n[Result "*"]\n\n1. e4 *\n');
  });

  test('a [Event "..."] inside the moves is not mistaken for a tag of this game', () => {
    const pgn = '[Event "A 1-0"]\n[ChapterName "A 1-0"]\n\n1. e4 *\n';
    const { header } = readGame(pgn);
    assert.equal(header, '[Event "A 1-0"]\n[ChapterName "A 1-0"]\n');
  });

  test('rows left without an opponent or score keep their original name', () => {
    const { text, names } = rename(STUDY_PGN);
    assert.equal(names[5], null);
    assert.equal(eventNames(text)[5], `${STUDY}: Wcm ploy`);
    assert.equal(chapterNames(text)[5], 'Wcm ploy');
  });

  test('edited rows (a typed opponent and a picked score) are renamed', () => {
    const plan = planGames(STUDY_PGN);
    const entries = plan.entries.map((e) => (e.index === 5 ? { ...e, opponent: 'Napat Khantree', score: '0-1' } : e));
    const { text } = renameStudy(STUDY_PGN, entries);
    assert.equal(eventNames(text)[5], 'Napat Khantree 0-1');
  });
});

describe('names and templates', () => {
  test('the template is configurable', () => {
    assert.equal(renderName('({opponent}) {score}', { opponent: 'A-Nak Viriya', score: '1-0' }), '(A-Nak Viriya) 1-0');
    assert.equal(renderName('{score} {opponent}', { opponent: 'Viriya', score: '0-1' }), '0-1 Viriya');
    const { text } = rename(STUDY_PGN, { rowsText: SHORT_ROWS, template: '({opponent}) {score}' });
    assert.equal(eventNames(text)[1], '(A-Nak Viriya) 1-0');
  });

  test('a template that does not use {score} does not wait for one', () => {
    assert.deepEqual(missingFields({ opponent: 'Viriya', score: '' }, '{opponent}'), []);
    assert.deepEqual(missingFields({ opponent: 'Viriya', score: '' }, '{opponent} {score}'), ['score']);
    assert.deepEqual(missingFields({ opponent: '  ', score: '1-0' }, '{opponent} {score}'), ['opponent']);
  });

  test('double quotes become single quotes so the tag stays valid', () => {
    assert.equal(cleanTagValue('Nok "The Rook" Anan'), "Nok 'The Rook' Anan");
    const { text } = renameStudy(
      '[Event "x"]\n\n1. e4 *\n',
      [{ index: 0, original: 'x', opponent: 'Nok "The Rook" Anan', score: '1-0', opponentFrom: '', scoreFrom: '', notes: [] }],
    );
    assert.equal(text, `[Event "Nok 'The Rook' Anan 1-0"]\n\n1. e4 *\n`);
  });

  test('"$&" and friends in a name are written literally', () => {
    assert.equal(renderName('{opponent} {score}', { opponent: 'A$&B$1', score: '1-0' }), 'A$&B$1 1-0');
    const out = applyRenames('[Event "x"]\n[ChapterName "x"]\n\n*\n', ['A$&B $`']);
    assert.equal(out, '[Event "A$&B $`"]\n[ChapterName "A$&B $`"]\n\n*\n');
  });

  test('stray whitespace and newlines in a pasted name cannot break a tag line', () => {
    assert.equal(cleanTagValue('  Nok\n\tAnan  '), 'Nok Anan');
  });

  test('formatName', () => {
    assert.equal(formatName('Viriya, A-Nak'), 'A-Nak Viriya');
    assert.equal(formatName('Viriya, A-Nak', 'last-first'), 'Viriya, A-Nak');
    assert.equal(formatName('Van Der Berg,  Jan'), 'Jan Van Der Berg');
    assert.equal(formatName('Myat Kaung,'), 'Myat Kaung');
    assert.equal(formatName('Somchai P'), 'Somchai P');
  });
});

describe('chess-results rows', () => {
  test('tab-separated rows: the title cell is dropped, the last cell is the result', () => {
    assert.deepEqual(parseRow('6\t5\t11\tWCM\tKhantree, Napat\t1605\tTHA\t3,5\t0'), {
      name: 'Khantree, Napat',
      score: '0-1',
    });
  });

  test('a decimal-comma points cell is not mistaken for the name', () => {
    assert.deepEqual(parseRow('3\t4\t9\t\tWeera, Ackkharawin\t0\tTHA\t1,5\t1'), { name: 'Weera, Ackkharawin', score: '1-0' });
  });

  test('an unplayed game has an empty Res. cell, not the opponent\'s points as a result', () => {
    assert.deepEqual(parseRow('4\t1\t3\t\tKamonhat, Tumpapon\t1710\tTHA\t1\t'), { name: 'Kamonhat, Tumpapon', score: '' });
  });

  test('rows split by two or more spaces', () => {
    assert.deepEqual(parseRow('6   5   11   WCM   Khantree, Napat   1605   THA   3,5   0'), { name: 'Khantree, Napat', score: '0-1' });
  });

  test('a single-spaced row, with or without a title', () => {
    assert.deepEqual(parseRow('Ninpattanangkul, Nachanop 1'), { name: 'Ninpattanangkul, Nachanop', score: '1-0' });
    assert.deepEqual(parseRow('WCM Khantree, Napat 0'), { name: 'Khantree, Napat', score: '0-1' });
    assert.deepEqual(parseRow('6 5 11 WCM Khantree, Napat 1605 THA 3.5 0'), { name: 'Khantree, Napat', score: '0-1' });
    assert.deepEqual(parseRow('Khantree, Napat'), { name: 'Khantree, Napat', score: '' });
  });

  test('every way of writing a result', () => {
    assert.deepEqual(['1', '0', '½', '0.5', '0,5', '1/2', '+', '-', '', '4'].map(scoreFromPoints), [
      '1-0', '0-1', '1/2-1/2', '1/2-1/2', '1/2-1/2', '1/2-1/2', '1-0', '0-1', '', '',
    ]);
  });

  test('headers, byes and blank lines are skipped and counted', () => {
    const text = [
      'Rd.\tBo.\tSNo\t\tName\tRtg\tFED\tPts.\tRes.',
      '1\t3\t12\t\tNinpattanangkul, Nachanop\t1450\tTHA\t0\t1',
      '',
      '2\t\t\t\tbye\t\t\t\t1',
      '3\t2\t7\t\tViriya, A-Nak\t1520\tTHA\t1\t½',
    ].join('\r\n');
    const { rows, ignored } = parseChessResultsRows(text);
    assert.deepEqual(rows, [
      { name: 'Ninpattanangkul, Nachanop', score: '1-0' },
      { name: 'Viriya, A-Nak', score: '1/2-1/2' },
    ]);
    assert.equal(ignored, 2);
  });

  test('a row count that differs from the game count is warned about', () => {
    const { plan } = rename(STUDY_PGN, { rowsText: SHORT_ROWS.split('\n').slice(0, 8).join('\n') });
    assert.equal(plan.warnings.length, 1);
    assert.match(plan.warnings[0], /8 chess-results rows for 9 games/);
    // The first eight still line up, and the ninth keeps what its own PGN said.
    assert.equal(plan.entries[7].opponent, 'Mondanai Sophai');
    assert.equal(plan.entries[8].opponent, '');
  });

  test('no pasted rows means no row-count warning', () => {
    assert.deepEqual(rename(STUDY_PGN).plan.warnings, []);
  });
});
