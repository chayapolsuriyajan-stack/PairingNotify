/**
 * Parse a chess-results player card (art=9): one row per round, giving the board
 * number, the opponent and the opponent's rating. This is the primary data source
 * because a single request yields everything a notification needs.
 */

import { fetchHtml, tournamentUrl } from './client.js';
import { findTable, columnIndex, dataRows, ownCells, colourIn, clean, toInt } from './table.js';

const COL = {
  round: ['Rd.', 'Rd', 'Round', 'Rnd'],
  board: ['Bo.', 'Bo', 'Board', 'Brd'],
  opponentNo: ['SNo', 'SNo.', 'No.', 'Nr.'],
  opponent: ['Name'],
  rating: ['Rtg', 'RtgI', 'Rating', 'Elo'],
  federation: ['FED'],
  points: ['Pts.', 'Pts'],
  result: ['Res.', 'Res', 'Result'],
};

/**
 * Colour is not a labelled column on the player card. Current chess-results markup
 * puts a `FarbewT`/`FarbesT` div inside the result cell; older templates used a glyph
 * cell just left of the result. Check the result cell first, then its neighbours.
 */
function readColour($, cells, resultIndex) {
  if (resultIndex < 0) return null;
  for (const index of [resultIndex, resultIndex - 1, resultIndex - 2]) {
    if (index < 0 || index >= cells.length) continue;
    const colour = colourIn($, cells[index]);
    if (colour) return colour;
  }
  return null;
}

/**
 * @param {string} html  Raw player-card HTML.
 * @returns {Array<{round:number, board:number|null, opponentNo:number|null,
 *                  opponent:string|null, rating:number|null, federation:string|null,
 *                  colour:'white'|'black'|null, result:string|null, paired:boolean}>}
 */
export function parsePlayerCard(html) {
  const { $, table, headerRow, columns } = findTable(html, [COL.round, COL.opponent]);

  const index = Object.fromEntries(
    Object.entries(COL).map(([key, aliases]) => [key, columnIndex(columns, aliases)]),
  );

  const rounds = [];

  for (const row of dataRows($, table, headerRow)) {
    const cells = ownCells($, row);
    if (cells.length < 3) continue;

    const round = toInt($(cells[index.round]).text());
    if (round == null) continue; // spacer / summary rows

    const opponent = index.opponent >= 0 ? clean($(cells[index.opponent]).text()) : '';
    const board = index.board >= 0 ? toInt($(cells[index.board]).text()) : null;
    const result = index.result >= 0 ? clean($(cells[index.result]).text()) : null;

    // A round with no named opponent is a bye, a forfeit or a not-yet-paired
    // placeholder. Those must never fire a notification.
    const paired = Boolean(opponent) && !/^(bye|not paired|-)$/i.test(opponent);

    rounds.push({
      round,
      board,
      opponentNo: index.opponentNo >= 0 ? toInt($(cells[index.opponentNo]).text()) : null,
      opponent: paired ? opponent : null,
      rating: index.rating >= 0 ? toInt($(cells[index.rating]).text()) || null : null, // 0 = unrated
      federation: index.federation >= 0 ? clean($(cells[index.federation]).text()) || null : null,
      colour: readColour($, cells, index.result),
      result: result || null,
      paired,
    });
  }

  if (rounds.length === 0) {
    throw new Error(
      'Player card table was found but produced no round rows — the row layout has changed.',
    );
  }

  return rounds.sort((a, b) => a.round - b.round);
}

/** Fetch and parse one player's card in a tournament. */
export async function fetchPlayerCard(tournamentId, startNo) {
  const url = tournamentUrl(tournamentId, { art: '9', snr: String(startNo) });
  const html = await fetchHtml(url);
  return { url, rounds: parsePlayerCard(html) };
}
