/**
 * Parsers for the tournament pages the app browses: round pairings (art=2), standings
 * (art=1&rd=N), the starting-rank crosstable (art=5), the playing schedule (art=14),
 * plus the tournament-details block and the round menu that appear on most pages.
 *
 * Every page names players with a link to their card (`...art=9&snr=12`), so players
 * are identified by start number everywhere — names differ in punctuation between
 * pages ("Kantor, Sam" vs "Kantor Sam").
 *
 * Checked against real pages captured 2026-09-19 (see __fixtures__/real-*.html).
 */

import * as cheerio from 'cheerio';
import { fetchHtml, tournamentUrl } from './client.js';
import {
  findTable,
  columnIndexes,
  dataRows,
  ownRows,
  ownCells,
  cellText,
  clean,
  toInt,
  toScore,
} from './table.js';

const load = (html) => (typeof html === 'string' ? cheerio.load(html) : html);

/** Start number from a player link inside `cell`, or null. */
function snrIn($, cell) {
  const href = $(cell).find('a[href*="snr="]').attr('href') ?? '';
  const match = href.match(/[?&]snr=(\d+)/i);
  return match ? Number(match[1]) : null;
}

/** Normalised header labels of a row, by position. */
function labels($, row) {
  return ownCells($, row).map((cell) => clean($(cell).text()).toLowerCase().replace(/[.\s]/g, ''));
}

/**
 * Parse a game result: "1 - 0", "½ - ½", "0 - 1", or forfeits "+ - -" / "- - +".
 * An empty cell (game not finished) returns null.
 */
export function parseResult(text) {
  const parts = clean(text).split(' - ');
  if (parts.length !== 2) return null;
  const side = (s) => (s === '+' ? 1 : s === '-' ? 0 : toScore(s));
  const white = side(parts[0]);
  const black = side(parts[1]);
  if (white == null || black == null) return null;
  return { white, black, forfeit: parts.some((p) => p === '+' || p === '-') };
}

// ---------------------------------------------------------------------------
// Round pairings (art=2&rd=N)
// ---------------------------------------------------------------------------

/**
 * @returns {Array<{board:number, white:{startNo:number|null,name:string,rating:number|null,title:string|null,points:number|null},
 *   black:{...}|null, result:{white:number,black:number,forfeit:boolean}|null, bye:boolean, notPaired:boolean, resultText:string}>}
 */
export function parsePairings(html) {
  const { $, table, headerRow } = findTable(load(html), [['Bo.', 'Bo', 'Board'], ['White', 'Weiß'], ['Black', 'Schwarz']]);
  const head = labels($, headerRow);
  const at = (label, from = 0) => head.indexOf(label, from);

  const whiteAt = at('white');
  const blackAt = at('black');
  const col = {
    board: at('bo') >= 0 ? at('bo') : at('board'),
    whiteRating: at('rtg', whiteAt),
    whitePts: at('pts', whiteAt),
    result: at('result'),
    blackPts: at('pts', at('result')),
    blackRating: at('rtg', blackAt),
    whiteTitle: whiteAt - 1,
    blackTitle: blackAt - 1,
  };

  const games = [];
  for (const row of dataRows($, table, headerRow)) {
    const cells = ownCells($, row);
    const board = toInt(cellText($, cells, col.board));
    if (board == null) continue;

    const blackName = cellText($, cells, blackAt);
    const bye = /^bye$/i.test(blackName);
    const notPaired = /not paired/i.test(blackName);
    const resultText = cellText($, cells, col.result);

    const side = (nameAt, ratingAt, ptsAt, titleAt) => ({
      startNo: snrIn($, cells[nameAt]),
      name: cellText($, cells, nameAt),
      rating: toInt(cellText($, cells, ratingAt)) || null,
      title: cellText($, cells, titleAt) || null,
      points: toScore(cellText($, cells, ptsAt)),
    });

    games.push({
      board,
      white: side(whiteAt, col.whiteRating, col.whitePts, col.whiteTitle),
      black: bye || notPaired ? null : side(blackAt, col.blackRating, col.blackPts, col.blackTitle),
      bye,
      notPaired,
      resultText,
      result: bye || notPaired ? null : parseResult(resultText),
    });
  }

  if (games.length === 0) throw new Error('Pairings table was found but produced no boards.');
  return games;
}

// ---------------------------------------------------------------------------
// Standings (art=1&rd=N)
// ---------------------------------------------------------------------------

const STANDINGS = {
  rank: ['Rk.', 'Rk', 'Rank'],
  startNo: ['SNo', 'SNo.', 'No.'],
  name: ['Name'],
  federation: ['FED'],
  rating: ['Rtg', 'RtgI', 'Rating'],
  points: ['Pts.', 'Pts'],
  tb1: ['TB1'],
  tb2: ['TB2'],
  tb3: ['TB3'],
};

/** @returns {Array<{rank:number, startNo:number, name:string, title:string|null, federation:string|null, rating:number|null, points:number|null, tiebreaks:number[]}>} */
export function parseStandings(html) {
  const { $, table, headerRow, columns } = findTable(load(html), [STANDINGS.rank, STANDINGS.name, STANDINGS.points]);
  const index = columnIndexes(columns, STANDINGS);

  const rows = [];
  let lastRank = null;
  for (const row of dataRows($, table, headerRow)) {
    const cells = ownCells($, row);
    const name = cellText($, cells, index.name);
    if (!name) continue;
    // Tied players leave the rank cell blank after the first of the tie.
    const rank = toInt(cellText($, cells, index.rank)) ?? lastRank;
    lastRank = rank;
    rows.push({
      rank,
      startNo: toInt(cellText($, cells, index.startNo)) ?? snrIn($, cells[index.name]),
      name,
      title: cellText($, cells, index.name - 1) || null,
      federation: cellText($, cells, index.federation) || null,
      rating: toInt(cellText($, cells, index.rating)) || null,
      points: toScore(cellText($, cells, index.points)),
      tiebreaks: [index.tb1, index.tb2, index.tb3]
        .filter((i) => i >= 0)
        .map((i) => toScore(cellText($, cells, i)) ?? 0),
    });
  }

  if (rows.length === 0) throw new Error('Standings table was found but produced no players.');
  return rows;
}

// ---------------------------------------------------------------------------
// Starting-rank crosstable (art=5)
// ---------------------------------------------------------------------------

/**
 * One crosstable cell: "17b1" (vs 17, black, won), "6w" (paired, no result yet),
 * "-1" (bye / point without a game), "-0" (absent), "27b+" (forfeit win), "18w-"
 * (forfeit loss), "7b½" (draw).
 *
 * @returns {{opponent:number|null, colour:'white'|'black'|null, score:number|null,
 *            kind:'game'|'pending'|'forfeit'|'bye'|'absent'}}
 */
export function parseCrossCell(text) {
  const raw = clean(text).replace(/\s/g, '');
  const match = raw.match(/^(\d+)?([wbs])?(.*)$/i);
  if (!raw || !match) return { opponent: null, colour: null, score: null, kind: 'absent' };

  const [, opp, col, rest] = match;
  const colour = col ? (col.toLowerCase() === 'w' ? 'white' : 'black') : null;
  const opponent = opp ? Number(opp) : null;

  if (opponent == null) {
    // No opponent: "-1" / "-½" is a point awarded without a game, "-0" is absent.
    const score = toScore(rest.replace(/^-/, '')) ?? 0;
    return { opponent: null, colour: null, score, kind: score > 0 ? 'bye' : 'absent' };
  }
  if (rest === '') return { opponent, colour, score: null, kind: 'pending' };
  if (rest === '+') return { opponent, colour, score: 1, kind: 'forfeit' };
  if (rest === '-') return { opponent, colour, score: 0, kind: 'forfeit' };
  return { opponent, colour, score: toScore(rest), kind: 'game' };
}

/**
 * @returns {{rounds:number, players:Array<{startNo:number, name:string, title:string|null,
 *   rating:number|null, federation:string|null, points:number|null, rank:number|null,
 *   games:Array<ReturnType<typeof parseCrossCell> & {round:number}>}>}}
 */
export function parseCrosstable(html) {
  const $ = load(html);
  const { table, headerRow, columns } = findTable($, [['No.', 'SNo', 'Nr.'], ['Name'], ['1.Rd', '1.Rd.', '1Rd']]);
  const head = labels($, headerRow);
  const index = columnIndexes(columns, {
    startNo: ['No.', 'SNo', 'Nr.'],
    name: ['Name'],
    rating: ['Rtg', 'RtgI', 'Rating'],
    federation: ['FED'],
    points: ['Pts.', 'Pts'],
    rank: ['Rk.', 'Rk'],
  });
  const roundCols = head
    .map((label, i) => ({ round: Number(label.match(/^(\d+)rd$/)?.[1]), i }))
    .filter((c) => Number.isFinite(c.round));

  const players = [];
  for (const row of dataRows($, table, headerRow)) {
    const cells = ownCells($, row);
    const startNo = toInt(cellText($, cells, index.startNo));
    const name = cellText($, cells, index.name);
    if (startNo == null || !name) continue;
    players.push({
      startNo,
      name,
      title: cellText($, cells, index.name - 1) || null,
      rating: toInt(cellText($, cells, index.rating)) || null,
      federation: cellText($, cells, index.federation) || null,
      points: toScore(cellText($, cells, index.points)),
      rank: toInt(cellText($, cells, index.rank)),
      games: roundCols.map(({ round, i }) => ({ round, ...parseCrossCell(cellText($, cells, i)) })),
    });
  }

  if (players.length === 0) throw new Error('Crosstable was found but produced no players.');
  return { rounds: roundCols.length, players };
}

// ---------------------------------------------------------------------------
// Playing schedule (art=14)
// ---------------------------------------------------------------------------

/** @returns {Array<{round:number, date:string|null, time:string|null}>} dates as YYYY-MM-DD */
export function parseSchedule(html) {
  const { $, table, headerRow, columns } = findTable(load(html), [['Round', 'Rd.', 'Rd'], ['Date']]);
  const index = columnIndexes(columns, { round: ['Round', 'Rd.', 'Rd'], date: ['Date'], time: ['Time'] });
  const out = [];
  for (const row of dataRows($, table, headerRow)) {
    const cells = ownCells($, row);
    const round = toInt(cellText($, cells, index.round));
    if (round == null) continue;
    const rawDate = cellText($, cells, index.date);
    const ymd = rawDate.match(/(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})/);
    const dmy = rawDate.match(/(\d{1,2})[/.](\d{1,2})[/.](\d{4})/);
    const pad = (n) => String(n).padStart(2, '0');
    const date = ymd
      ? `${ymd[1]}-${pad(ymd[2])}-${pad(ymd[3])}`
      : dmy
        ? `${dmy[3]}-${pad(dmy[2])}-${pad(dmy[1])}`
        : null;
    const time = cellText($, cells, index.time).match(/\d{1,2}:\d{2}/)?.[0] ?? null;
    out.push({ round, date, time });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tournament details + round menu (present on most pages)
// ---------------------------------------------------------------------------

const DETAIL_KEYS = {
  organizer: /^organi[sz]er/i,
  federation: /^federation/i,
  director: /^tournament director/i,
  arbiter: /^chief arbiter/i,
  timeControl: /^time control/i,
  location: /^location/i,
  rounds: /^number of rounds/i,
  type: /^tournament type/i,
  date: /^date$/i,
};

/**
 * The key/value details block shown on crosstable pages ("Tournament type
 * Swiss-System", "Number of rounds 9"...). Missing keys are simply absent.
 */
export function parseDetails(html) {
  const $ = load(html);
  const out = {};
  $('tr').each((_, row) => {
    const cells = ownCells($, row);
    if (cells.length !== 2) return;
    const key = clean($(cells[0]).text());
    const value = clean($(cells[1]).text());
    if (!key || !value || key.length > 40) return;
    for (const [name, pattern] of Object.entries(DETAIL_KEYS)) {
      if (!(name in out) && pattern.test(key)) out[name] = value;
    }
  });
  if (out.rounds) out.rounds = toInt(out.rounds);
  if (out.type) {
    out.format = /swiss/i.test(out.type) ? 'swiss' : /round.?robin|rundenturnier/i.test(out.type) ? 'round-robin' : 'other';
  }
  return out;
}

/**
 * Which rounds have published pairings, from the "Board Pairings" menu. The current
 * round is written "Rd.2/6", which also gives the total.
 *
 * @returns {{pairedRounds:number[], standingsRounds:number[], currentRound:number|null, totalRounds:number|null, lastUpdate:string|null}}
 */
export function parseMenu(html) {
  const $ = load(html);
  const rounds = (art) =>
    [
      ...new Set(
        $(`a[href*="art=${art}&"][href*="rd="], a[href*="art=${art}&amp;"][href*="rd="]`)
          .map((_, a) => Number(($(a).attr('href') ?? '').match(/[?&]rd=(\d+)/)?.[1]))
          .get()
          .filter(Number.isFinite),
      ),
    ].sort((a, b) => a - b);

  const text = clean($('body').text());
  const current = text.match(/Rd\.(\d+)\/(\d+)/);
  return {
    pairedRounds: rounds(2),
    standingsRounds: rounds(1),
    currentRound: current ? Number(current[1]) : null,
    totalRounds: current ? Number(current[2]) : null,
    lastUpdate: text.match(/Last update\s*([\d.]+\s[\d:]+)/)?.[1] ?? null,
  };
}

/** Header facts on a player card (art=9): name, FIDE ID, rating, club... */
export function parsePlayerHeader(html) {
  const $ = load(html);
  const out = {};
  const keys = {
    name: /^name$/i,
    startNo: /^starting rank$/i,
    rating: /^rating$/i,
    ratingInternational: /^rating international$/i,
    performance: /^performance rating$/i,
    federation: /^federation$/i,
    club: /^club/i,
    fideId: /^fide.?id$/i,
    points: /^points$/i,
    rank: /^rank$/i,
    title: /^title$/i,
    ratingChange: /^fide rtg \+\/-$|^rtg \+\/-$/i,
  };
  for (const table of $('table').toArray()) {
    for (const row of ownRows($, table)) {
      const cells = ownCells($, row);
      if (cells.length !== 2) continue;
      const key = clean($(cells[0]).text());
      const value = clean($(cells[1]).text());
      for (const [name, pattern] of Object.entries(keys)) {
        if (!(name in out) && pattern.test(key) && value) out[name] = value;
      }
    }
  }
  for (const k of ['startNo', 'rating', 'ratingInternational', 'performance', 'rank']) {
    if (k in out) out[k] = toInt(out[k]) || null;
  }
  if ('points' in out) out.points = toScore(out.points);
  if ('ratingChange' in out) out.ratingChange = toScore(out.ratingChange.replace(/^\+/, ''));
  return out;
}

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

const PAGE = { flag: '30', zeilen: '99999' };

export async function fetchPairings(id, round) {
  const html = await fetchHtml(tournamentUrl(id, { ...PAGE, art: '2', rd: String(round) }));
  return { games: parsePairings(html), menu: parseMenu(html) };
}

export async function fetchStandings(id, round) {
  const params = { ...PAGE, art: '1' };
  if (round) params.rd = String(round);
  const html = await fetchHtml(tournamentUrl(id, params));
  return { rows: parseStandings(html), menu: parseMenu(html) };
}

export async function fetchCrosstable(id) {
  const html = await fetchHtml(tournamentUrl(id, { ...PAGE, art: '5' }));
  const $ = cheerio.load(html);
  return {
    title: clean($('h2').first().text()) || null,
    ...parseCrosstable($),
    details: parseDetails($),
    menu: parseMenu($),
  };
}

export async function fetchSchedule(id) {
  const html = await fetchHtml(tournamentUrl(id, { ...PAGE, art: '14' }));
  try {
    return parseSchedule(html);
  } catch {
    return []; // many events never publish a schedule
  }
}
