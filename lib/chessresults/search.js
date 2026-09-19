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
 * The result lists a player's whole history (hundreds of rows for an active player),
 * so only events that end today or later — or ended in the last few days — are kept.
 * Polling a career's worth of finished events would be rude to chess-results.
 *
 * Every failure throws. poll.js treats a throw as "discovery is degraded" and keeps
 * polling the tournaments you added by link.
 */

import * as cheerio from 'cheerio';
import { fetchPage } from './client.js';
import { findTable, columnIndexes, dataRows, ownCells, cellText, clean } from './table.js';
import { normaliseName } from './tournament.js';

const SEARCH_PATH = 'SpielerSuche.aspx?lan=1';
const RECENT_DAYS = 3;
const MAX_RESULTS = 8;

/** "Suriyajan, Chayapol" -> { surname: "Suriyajan", given: "Chayapol" } */
export function splitName(name) {
  const text = clean(name);
  const comma = text.indexOf(',');
  if (comma >= 0) return { surname: text.slice(0, comma).trim(), given: text.slice(comma + 1).trim() };
  return { surname: text, given: '' };
}

/** Map the search form's inputs onto what we want to send. */
export function buildSearchForm(html, { playerName, fideId }) {
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

  if (fideId && fideField) {
    form[fideField] = String(fideId);
  } else {
    const { surname, given } = splitName(playerName);
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
  tournament: ['Tournament', 'Turnier'],
  endDate: ['End-Date', 'End date', 'Enddate', 'Enddatum'],
};

/**
 * Pick this player's current tournaments out of a search result page.
 *
 * @param {string} html
 * @param {{playerName?:string, fideId?:string|null, today?:Date}} who
 * @returns {Array<{id:string, label:string, endDate:string|null}>}  newest first
 */
export function parseSearchResults(html, { playerName, fideId, today = new Date() }) {
  const { $, table, headerRow, columns } = findTable(html, [RESULT_COLUMNS.name, RESULT_COLUMNS.tournament]);
  const index = columnIndexes(columns, RESULT_COLUMNS);
  const wanted = normaliseName(playerName ?? '').split(' ').filter(Boolean).sort().join(' ');
  const cutoff = new Date(today.getTime() - RECENT_DAYS * 86_400_000).toISOString().slice(0, 10);

  const found = new Map();
  for (const row of dataRows($, table, headerRow)) {
    const cells = ownCells($, row);
    const link = $(cells[index.tournament]).find('a[href*="tnr"]').attr('href') ?? '';
    const id = link.match(/tnr(\d+)\.aspx/i)?.[1];
    if (!id) continue;

    // Same person: FIDE ID when we have one, otherwise the same set of name words.
    const rowFide = cellText($, cells, index.fideId).replace(/\D/g, '');
    const rowName = normaliseName(cellText($, cells, index.name)).split(' ').filter(Boolean).sort().join(' ');
    const samePerson = fideId && rowFide && rowFide !== '0' ? rowFide === String(fideId).replace(/\D/g, '') : rowName === wanted;
    if (!samePerson) continue;

    const raw = cellText($, cells, index.endDate).match(/(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})/);
    const endDate = raw ? `${raw[1]}-${raw[2].padStart(2, '0')}-${raw[3].padStart(2, '0')}` : null;
    if (endDate && endDate < cutoff) continue; // finished a while ago

    if (!found.has(id)) {
      found.set(id, { id, label: clean($(cells[index.tournament]).attr('title') || $(cells[index.tournament]).text()), endDate });
    }
  }

  return [...found.values()]
    .sort((a, b) => String(b.endDate).localeCompare(String(a.endDate)))
    .slice(0, MAX_RESULTS);
}

/**
 * @param {{playerName?: string, fideId?: string|null}} query
 * @returns {Promise<Array<{id: string, label: string, endDate: string|null}>>}
 */
export async function discoverTournaments({ playerName, fideId = null }) {
  if (!playerName && !fideId) throw new Error('discoverTournaments needs a playerName or fideId');

  const page = await fetchPage(SEARCH_PATH);
  const { form, action } = buildSearchForm(page.html, { playerName, fideId });
  const results = await fetchPage(new URL(action, page.url).href, { form });

  if (!/tnr\d+\.aspx/i.test(results.html)) {
    throw new Error(
      `Search for "${fideId ?? playerName}" found no tournaments. Check the spelling matches chess-results ` +
        '("Surname, Given"), or add the tournament by link.',
    );
  }
  return parseSearchResults(results.html, { playerName, fideId });
}
