/**
 * Auto-discovery: find the tournaments a player is currently in, via chess-results'
 * player search (SpielerSuche.aspx).
 *
 * It's an ASP.NET WebForms page: GET it, echo its __VIEWSTATE / __EVENTVALIDATION
 * back, and POST the search to the same mirror server that served the form. The form
 * has separate surname / first-name / FIDE-ID fields (txt_nachname, txt_vorname,
 * txt_fideID — checked against the live page 2026-09-19); field names are still read
 * off the page rather than hardcoded, in case they change.
 *
 * FIDE ID first. Names on chess-results are entered by hand by hundreds of arbiters:
 * they arrive transliterated, abbreviated, with middle names dropped or with the
 * surname and given name swapped. A FIDE ID is the same number everywhere, so when we
 * have one we search by it and trust the server's filtering — a row whose FideID cell
 * is blank or 0 (common for locally-rated events) is still that player's row, and the
 * old code dropped exactly those. A name search runs only as a fallback.
 *
 * The result lists a player's whole history (hundreds of rows for an active player),
 * so only events that end today or later — or ended in the last few days — are kept.
 * Polling a career's worth of finished events would be rude to chess-results.
 *
 * Every failure throws. poll.js treats a throw as "discovery is degraded" and keeps
 * polling the tournaments you added by link.
 */

import * as cheerio from 'cheerio';
import { fetchPage } from './client.js';
import { findTable, columnIndexes, dataRows, ownCells, cellText, clean, toInt } from './table.js';
import { normaliseName } from './tournament.js';

const SEARCH_PATH = 'SpielerSuche.aspx?lan=1';
const RECENT_DAYS = 3;
const MAX_RESULTS = 8;

/** Digits only: "6200456 " and "6,200,456" are the same FIDE ID. */
const digits = (value) => String(value ?? '').replace(/\D/g, '');

/** A FIDE ID cell is "blank" when the event wasn't FIDE-rated: empty, 0, or 00000. */
const noFideId = (value) => !digits(value) || Number(digits(value)) === 0;

/** "Suriyajan, Chayapol" -> { surname: "Suriyajan", given: "Chayapol" } */
export function splitName(name) {
  const text = clean(name);
  const comma = text.indexOf(',');
  if (comma >= 0) return { surname: text.slice(0, comma).trim(), given: text.slice(comma + 1).trim() };
  return { surname: text, given: '' };
}

const words = (name) => normaliseName(name).split(' ').filter(Boolean);

/**
 * Do two chess-results spellings of a name describe the same player?
 *
 * The server has already filtered the rows by the surname we typed, so this is the
 * looser of the two checks in the codebase (tournament.js#findPlayer is the strict one
 * that picks a single player out of a start list). Same word set in any order, or one
 * name's words all present in the other's — "Suriyajan, Chayapol" then matches
 * "Suriyajan, Chayapol Ake" and "Chayapol Suriyajan".
 */
export function namesMatch(a, b) {
  const one = words(a);
  const two = words(b);
  if (one.length === 0 || two.length === 0) return false;
  const [short, long] = one.length <= two.length ? [one, two] : [two, one];
  return short.every((word) => long.includes(word));
}

/**
 * Map the search form's inputs onto what we want to send.
 *
 * @param {string} html
 * @param {{playerName?:string, fideId?:string|null, by?:'fide'|'name'}} query
 *        `by` overrides the default (FIDE ID when there is one, otherwise the name).
 */
export function buildSearchForm(html, { playerName, fideId, by = fideId ? 'fide' : 'name' }) {
  const $ = cheerio.load(html);
  const form = {};
  $('input[type=hidden]').each((_, el) => {
    const name = $(el).attr('name');
    if (name) form[name] = $(el).attr('value') ?? '';
  });
  if (!form.__VIEWSTATE) throw new Error('No __VIEWSTATE on the search page — it is no longer a WebForms form.');

  const inputs = $('input[type=text], input:not([type])')
    .toArray()
    .map((el) => $(el).attr('name'))
    .filter(Boolean);
  const field = (pattern) => inputs.find((name) => pattern.test(name));

  const surnameField = field(/nachname|lastname|surname/i);
  const givenField = field(/vorname|firstname|givenname/i);
  const fideField = field(/fide/i);
  if (!surnameField && !fideField) {
    throw new Error(`Could not find the name or FIDE ID field on the search form. Inputs: ${JSON.stringify(inputs)}`);
  }

  if (by === 'fide' && fideId && fideField) {
    form[fideField] = digits(fideId);
  } else {
    const { surname, given } = splitName(playerName);
    if (!surname) throw new Error('A name search needs a name.');
    if (!surnameField) throw new Error('No surname field on the search form.');
    form[surnameField] = surname;
    if (givenField && given) form[givenField] = given;
  }

  const submit = $('input[type=submit]')
    .toArray()
    .find((el) => /such|search/i.test(`${$(el).attr('name')} ${$(el).attr('value')}`) && !/excel|download/i.test($(el).attr('name') ?? ''));
  if (submit) form[$(submit).attr('name')] = $(submit).attr('value') ?? 'Search';

  return { form, action: $('form').attr('action') ?? SEARCH_PATH };
}

const RESULT_COLUMNS = {
  name: ['Name'],
  fideId: ['FideID', 'FIDE-ID', 'FIDE ID'],
  federation: ['FED'],
  tournament: ['Tournament', 'Turnier'],
  endDate: ['End-Date', 'End date', 'Enddate', 'Enddatum'],
  rank: ['Rk.', 'Rk', 'Rank'],
  rounds: ['Rd.', 'Rd', 'Rounds'],
};

/** "2026/09/19" (or -, .) -> "2026-09-19"; anything else -> null. */
function isoDate(text) {
  const raw = String(text).match(/(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})/);
  return raw ? `${raw[1]}-${raw[2].padStart(2, '0')}-${raw[3].padStart(2, '0')}` : null;
}

/** Every row of a search-result page, before we decide which ones are our player. */
function readRows(html) {
  const { $, table, headerRow, columns } = findTable(html, [RESULT_COLUMNS.name, RESULT_COLUMNS.tournament]);
  const index = columnIndexes(columns, RESULT_COLUMNS);

  const rows = [];
  for (const row of dataRows($, table, headerRow)) {
    const cells = ownCells($, row);
    const cell = $(cells[index.tournament]);
    const id = (cell.find('a[href*="tnr"]').attr('href') ?? '').match(/tnr(\d+)\.aspx/i)?.[1];
    if (!id) continue;

    // The player's own name links straight to their card: tnr123.aspx?...&art=9&snr=4.
    // That start number saves the poller a whole starting-rank download later.
    const startNo = toInt(($(cells[index.name]).find('a[href*="snr="]').attr('href') ?? '').match(/snr=(\d+)/i)?.[1]);

    rows.push({
      id,
      label: clean(cell.attr('title') || cell.text()),
      endDate: isoDate(cellText($, cells, index.endDate)),
      name: cellText($, cells, index.name),
      fideId: digits(cellText($, cells, index.fideId)) || null,
      federation: cellText($, cells, index.federation) || null,
      startNo,
      rank: toInt(cellText($, cells, index.rank)),
      rounds: toInt(cellText($, cells, index.rounds)),
    });
  }
  return rows;
}

/**
 * Pick this player's tournaments out of a search result page.
 *
 * @param {string} html
 * @param {object} who
 * @param {string} [who.playerName]
 * @param {string|null} [who.fideId]
 * @param {'fide'|'name'} [who.by]       which field the search was submitted with
 * @param {Date} [who.today]
 * @param {number} [who.recentDays]      how far back a finished event still counts
 * @param {number} [who.limit]
 * @returns {Array<{id:string, label:string, endDate:string|null, startNo:number|null,
 *                  name:string, fideId:string|null, federation:string|null,
 *                  rank:number|null, rounds:number|null}>}  newest first
 */
export function parseSearchResults(
  html,
  { playerName, fideId, by = fideId ? 'fide' : 'name', today = new Date(), recentDays = RECENT_DAYS, limit = MAX_RESULTS } = {},
) {
  const rows = readRows(html);
  const wantedFide = digits(fideId);
  // A page where no row carries a FIDE ID at all can't be filtered by one; a FIDE
  // search that got there was still filtered by the server, so trust it.
  const pageHasFideIds = rows.some((row) => row.fideId && !noFideId(row.fideId));
  const cutoff = new Date(today.getTime() - recentDays * 86_400_000).toISOString().slice(0, 10);

  const samePerson = (row) => {
    if (wantedFide && row.fideId && !noFideId(row.fideId)) return row.fideId === wantedFide;
    if (wantedFide && by === 'fide' && !pageHasFideIds) return true; // server filtered by ID
    if (playerName) return namesMatch(row.name, playerName);
    // FIDE search, blank FideID cell (a non-FIDE-rated event): still our player's row.
    return Boolean(wantedFide && by === 'fide');
  };

  const found = new Map();
  for (const row of rows) {
    if (!samePerson(row)) continue;
    if (row.endDate && row.endDate < cutoff) continue; // finished a while ago
    if (!found.has(row.id)) found.set(row.id, row);
  }

  return [...found.values()]
    .sort((a, b) => String(b.endDate).localeCompare(String(a.endDate)))
    .slice(0, limit);
}

/** GET the search form, POST one query, return the result page's HTML. */
async function runSearch({ playerName, fideId, by }) {
  const page = await fetchPage(SEARCH_PATH);
  const { form, action } = buildSearchForm(page.html, { playerName, fideId, by });
  const results = await fetchPage(new URL(action, page.url).href, { form });
  return results.html;
}

/**
 * The tournaments a player is in right now.
 *
 * Tries the FIDE ID first and falls back to the name, so a player whose name is spelt
 * differently in this event is still found, and a player whose FIDE ID was typed wrong
 * (or who has none in this event) still gets their name search.
 *
 * @param {{playerName?: string, fideId?: string|null, today?: Date}} query
 * @returns {Promise<Array<object>>} see parseSearchResults
 */
export async function discoverTournaments({ playerName, fideId = null, today = new Date() }) {
  if (!playerName && !fideId) throw new Error('discoverTournaments needs a playerName or fideId');

  const attempts = [];
  if (digits(fideId)) attempts.push('fide');
  if (playerName) attempts.push('name');

  let lastPage = null;
  for (const by of attempts) {
    const html = await runSearch({ playerName, fideId, by });
    lastPage = html;
    if (!/tnr\d+\.aspx/i.test(html)) continue; // "no players found"
    const found = parseSearchResults(html, { playerName, fideId, by, today });
    if (found.length > 0) return found;
  }

  if (lastPage && /tnr\d+\.aspx/i.test(lastPage)) return []; // found the player, no current events
  throw new Error(
    `Search found no player for ${digits(fideId) ? `FIDE ID ${digits(fideId)}` : `"${playerName}"`}. ` +
      'Check the FIDE ID, or the spelling chess-results uses ("Surname, Given"), or add the tournament by link.',
  );
}

/**
 * Free-text search for the app's own "find my events" box: a FIDE ID, or a name.
 *
 * Unlike discovery this is a person looking at a screen, so it keeps a wider window
 * (an event that ended last week is still what you were looking for) and groups the
 * rows by player, because a name search legitimately returns several people.
 *
 * @param {{query: string, today?: Date, recentDays?: number, limit?: number}} options
 * @returns {Promise<Array<{name:string, fideId:string|null, federation:string|null,
 *                          tournaments:Array<object>}>>}
 */
export async function searchPlayers({ query, today = new Date(), recentDays = 21, limit = 12 }) {
  const text = clean(query);
  if (!text) throw new Error('Type a name or a FIDE ID.');
  const asFideId = /^\d{4,12}$/.test(text.replace(/\s/g, '')) ? text.replace(/\s/g, '') : null;

  const html = await runSearch(
    asFideId ? { fideId: asFideId, by: 'fide' } : { playerName: text, by: 'name' },
  );
  if (!/tnr\d+\.aspx/i.test(html)) {
    throw new Error(
      asFideId
        ? `No player on chess-results has FIDE ID ${asFideId}.`
        : `No player found for "${text}". chess-results lists players as "Surname, Given".`,
    );
  }

  const rows = parseSearchResults(html, {
    fideId: asFideId,
    playerName: asFideId ? undefined : text,
    by: asFideId ? 'fide' : 'name',
    today,
    recentDays,
    limit,
  });

  return groupPlayers(rows, asFideId);
}

/**
 * Group result rows into the people they belong to.
 *
 * A name search legitimately returns several players ("Habla" is a surname, not a
 * person), and the same person's rows disagree about their FIDE ID whenever one of the
 * events wasn't FIDE-rated — so rows with an ID group by it, and the rest by name.
 *
 * @param {Array<object>} rows              see parseSearchResults
 * @param {string|null} [searchedFideId]    the ID the search was made with, if any
 */
export function groupPlayers(rows, searchedFideId = null) {
  const players = new Map();
  for (const row of rows) {
    const id = row.fideId && !noFideId(row.fideId) ? row.fideId : null;
    const key = id ? `f:${id}` : `n:${normaliseName(row.name)}`;
    const player = players.get(key) ?? {
      name: row.name,
      fideId: id ?? searchedFideId,
      federation: row.federation,
      tournaments: [],
    };
    if (!player.federation) player.federation = row.federation;
    player.tournaments.push(row);
    players.set(key, player);
  }
  return [...players.values()];
}
