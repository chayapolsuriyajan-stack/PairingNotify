/**
 * Tournament-level scraping: the title, and the starting-rank list used to turn a
 * player name (or FIDE ID) into the starting number that the player card needs.
 */

import * as cheerio from 'cheerio';
import { fetchHtml, tournamentUrl } from './client.js';
import { findTable, columnIndex, dataRows, clean, toInt } from './table.js';

const COL = {
  startNo: ['SNo', 'SNo.', 'No.', 'Nr.', 'Snr'],
  name: ['Name'],
  rating: ['Rtg', 'RtgI', 'Rating', 'Elo'],
  federation: ['FED'],
  fideId: ['FideID', 'ID-Number', 'IDNumber', 'ID', 'FIDE-ID'],
};

/**
 * Fold accents and case so "Šimon Novák" matches "Simon Novak", and drop punctuation
 * so "Suriyajan, Chayapol" matches "Suriyajan Chayapol".
 */
export function normaliseName(name) {
  return clean(name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Two names match if they use the same word set, in any order. */
function namesMatch(a, b) {
  const wordsA = normaliseName(a).split(' ').filter(Boolean).sort().join(' ');
  const wordsB = normaliseName(b).split(' ').filter(Boolean).sort().join(' ');
  return wordsA.length > 0 && wordsA === wordsB;
}

export function parseTournamentTitle(html) {
  const $ = cheerio.load(html);
  const heading = clean($('h2').first().text()) || clean($('title').first().text());
  return heading || null;
}

/**
 * @returns {Array<{startNo:number, name:string, rating:number|null,
 *                  federation:string|null, fideId:string|null}>}
 */
export function parseStartingRank(html) {
  const { $, table, headerRow, columns } = findTable(html, [COL.startNo, COL.name]);

  const index = Object.fromEntries(
    Object.entries(COL).map(([key, aliases]) => [key, columnIndex(columns, aliases)]),
  );

  const players = [];
  for (const row of dataRows($, table, headerRow)) {
    const cells = $(row).find('td').toArray();
    if (cells.length < 2) continue;

    const startNo = toInt($(cells[index.startNo]).text());
    const name = clean($(cells[index.name]).text());
    if (startNo == null || !name) continue;

    players.push({
      startNo,
      name,
      rating: index.rating >= 0 ? toInt($(cells[index.rating]).text()) : null,
      federation: index.federation >= 0 ? clean($(cells[index.federation]).text()) || null : null,
      fideId: index.fideId >= 0 ? clean($(cells[index.fideId]).text()) || null : null,
    });
  }

  if (players.length === 0) {
    throw new Error('Starting-rank table was found but produced no players.');
  }
  return players;
}

/**
 * Locate our player in a starting-rank list.
 *
 * FIDE ID wins when available — it is unambiguous. Falling back to the name, an exact
 * word-set match is preferred; a "surname appears and every given-name word appears"
 * match is accepted only when it is unique, so two players sharing a surname never
 * silently resolve to the wrong person.
 *
 * @returns {{player: object, matchedBy: 'fideId'|'name'|'partial'} | null}
 */
export function findPlayer(players, { playerName, fideId }) {
  if (fideId) {
    const wanted = String(fideId).trim();
    const hit = players.find((p) => p.fideId && p.fideId.replace(/\D/g, '') === wanted.replace(/\D/g, ''));
    if (hit) return { player: hit, matchedBy: 'fideId' };
  }

  if (!playerName) return null;

  const exact = players.filter((p) => namesMatch(p.name, playerName));
  if (exact.length === 1) return { player: exact[0], matchedBy: 'name' };
  if (exact.length > 1) {
    throw new Error(
      `"${playerName}" matches ${exact.length} players in this tournament ` +
        `(start numbers ${exact.map((p) => p.startNo).join(', ')}). ` +
        'Set "fideId" in watchlist.json to disambiguate.',
    );
  }

  const wanted = normaliseName(playerName).split(' ').filter(Boolean);
  const partial = players.filter((p) => {
    const words = normaliseName(p.name).split(' ').filter(Boolean);
    return wanted.every((word) => words.includes(word));
  });
  if (partial.length === 1) return { player: partial[0], matchedBy: 'partial' };
  if (partial.length > 1) {
    // Returning null here would be reported as "not in this tournament", which is
    // false and would quietly cost you every notification for this event.
    throw new Error(
      `"${playerName}" matches ${partial.length} players in this tournament ` +
        `(${partial.map((p) => `${p.name} #${p.startNo}`).join(', ')}). ` +
        'Use your full name, or set "fideId" in watchlist.json.',
    );
  }

  return null;
}

export async function fetchStartingRank(tournamentId) {
  const url = tournamentUrl(tournamentId, { art: '1', flag: '30', zeilen: '99999' });
  const html = await fetchHtml(url);
  return { url, title: parseTournamentTitle(html), players: parseStartingRank(html) };
}
