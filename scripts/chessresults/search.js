/**
 * Auto-discovery: find the tournaments a player appears in, via chess-results'
 * player search.
 *
 * This is by far the most breakage-prone part of the system. SpielerSuche.aspx is an
 * ASP.NET WebForms page: you must GET it, carry its __VIEWSTATE / __EVENTVALIDATION
 * tokens back, and POST the search. The field names are not documented and are not
 * stable, so nothing here is hardcoded — the form is read off the page each time.
 *
 * Every failure mode throws. The caller (poll.js) treats a throw as "discovery is
 * degraded" and continues with the pinned tournaments from watchlist.json, so a broken
 * search never costs you a notification for a tournament you pinned.
 */

import * as cheerio from 'cheerio';
import { fetchHtml, BASE } from './client.js';
import { clean } from './table.js';
import { normaliseName } from './tournament.js';

const SEARCH_PATH = 'SpielerSuche.aspx?lan=1';

/** How many player-detail pages we are willing to open per run. */
const MAX_PLAYER_PAGES = 3;

/** Collect every hidden input ASP.NET needs echoed back. */
function readFormState($) {
  const state = {};
  $('input[type=hidden]').each((_, el) => {
    const name = $(el).attr('name');
    if (name) state[name] = $(el).attr('value') ?? '';
  });
  if (!state.__VIEWSTATE) {
    throw new Error('No __VIEWSTATE on the search page — it is no longer a WebForms form.');
  }
  return state;
}

/** Guess which text input holds the player name. */
function findNameField($) {
  const candidates = $('input[type=text], input:not([type])').toArray();
  const scored = candidates
    .map((el) => {
      const id = `${$(el).attr('name') ?? ''} ${$(el).attr('id') ?? ''}`.toLowerCase();
      let score = 0;
      if (/nam/.test(id)) score += 10; // txt_name / tb_naam / ...
      if (/such|search|zoek/.test(id)) score += 5;
      if (/fide|id|elo|rtg|year|jahr/.test(id)) score -= 10;
      return { name: $(el).attr('name'), score };
    })
    .filter((c) => c.name)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0 || scored[0].score <= 0) {
    throw new Error(
      `Could not identify the name field on the search form. Inputs seen: ` +
        JSON.stringify(candidates.map((el) => $(el).attr('name')).filter(Boolean)),
    );
  }
  return scored[0].name;
}

/** Guess the submit button, which WebForms requires in the POST body. */
function findSubmitField($) {
  const el = $('input[type=submit], input[type=button]')
    .toArray()
    .find((candidate) => {
      const id = `${$(candidate).attr('name') ?? ''} ${$(candidate).attr('id') ?? ''}`.toLowerCase();
      return /such|search|zoek|ok|start/.test(id);
    });
  if (!el) return null;
  return { name: $(el).attr('name'), value: $(el).attr('value') ?? 'Search' };
}

/** Pull every tournament id linked from a page. */
function harvestTournaments($) {
  const found = new Map();
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const match = href.match(/tnr(\d+)\.aspx/i);
    if (!match) return;
    const id = match[1];
    const label = clean($(el).text()) || clean($(el).closest('tr').text()).slice(0, 120);
    if (!found.has(id)) found.set(id, { id, label: label || `Tournament ${id}` });
  });
  return [...found.values()];
}

/**
 * @param {{playerName: string}} query
 * @returns {Promise<Array<{id: string, label: string}>>}
 */
export async function discoverTournaments({ playerName }) {
  if (!playerName) throw new Error('discoverTournaments needs a playerName');

  const searchPage = await fetchHtml(SEARCH_PATH);
  const $search = cheerio.load(searchPage);

  const form = readFormState($search);
  form[findNameField($search)] = playerName;
  const submit = findSubmitField($search);
  if (submit?.name) form[submit.name] = submit.value;

  const resultsHtml = await fetchHtml(SEARCH_PATH, { form });
  const $results = cheerio.load(resultsHtml);

  // Some result pages link tournaments directly; others list players first.
  const direct = harvestTournaments($results);
  if (direct.length > 0) return direct;

  const wanted = normaliseName(playerName);
  const playerLinks = $results('a[href]')
    .toArray()
    .filter((el) => {
      const rowText = normaliseName($results(el).closest('tr').text());
      return rowText.includes(wanted) || normaliseName($results(el).text()).includes(wanted);
    })
    .map((el) => $results(el).attr('href'))
    .filter((href) => href && !/^(#|javascript:)/i.test(href))
    .slice(0, MAX_PLAYER_PAGES);

  if (playerLinks.length === 0) {
    throw new Error(
      `Search for "${playerName}" returned no tournaments and no matching player rows. ` +
        'Either the name is spelled differently on chess-results, or the results markup changed.',
    );
  }

  const collected = new Map();
  for (const href of playerLinks) {
    const url = href.startsWith('http') ? href : `${BASE}/${href.replace(/^\//, '')}`;
    const html = await fetchHtml(url);
    for (const tournament of harvestTournaments(cheerio.load(html))) {
      collected.set(tournament.id, tournament);
    }
  }

  if (collected.size === 0) {
    throw new Error(`Found player pages for "${playerName}" but no tournament links on them.`);
  }
  return [...collected.values()];
}
