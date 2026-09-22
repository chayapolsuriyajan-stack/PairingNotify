import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildSearchForm, groupPlayers, namesMatch, parseSearchResults, splitName } from '../chessresults/search.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', '__fixtures__');
const fixture = (name) => readFileSync(join(FIXTURES, name), 'utf8');

describe('player search (real SpielerSuche.aspx pages, 2026-09-19)', () => {
  test('fills surname and first name separately', () => {
    const { form } = buildSearchForm(fixture('real-search-form.html'), { playerName: 'Habla, Jony' });
    assert.equal(form['ctl00$P1$txt_nachname'], 'Habla');
    assert.equal(form['ctl00$P1$txt_vorname'], 'Jony');
    assert.equal(form['ctl00$P1$cb_suchen'], 'Search');
    assert.ok(form.__VIEWSTATE);
    assert.equal(form['ctl00$P1$cb_download_Excel'], undefined, 'must not press the Excel button');
  });

  test('searches by FIDE ID when there is one', () => {
    const { form } = buildSearchForm(fixture('real-search-form.html'), { playerName: 'Habla, Jony', fideId: '5207363' });
    assert.equal(form['ctl00$P1$txt_fideID'], '5207363');
    assert.equal(form['ctl00$P1$txt_nachname'], undefined);
  });

  test('keeps only current events out of a long history', () => {
    const found = parseSearchResults(fixture('real-player-search.html'), {
      playerName: 'Habla, Jony',
      today: new Date('2026-09-19T12:00:00Z'),
    });
    const ids = found.map((t) => t.id);
    assert.ok(ids.includes('1486488'), 'the event being played today');
    assert.ok(ids.length > 0 && ids.length <= 8, `got ${ids.length} of 224 history rows`);
    assert.ok(found.every((t) => t.endDate >= '2026-09-16'));
  });

  test('matches by FIDE ID too', () => {
    const found = parseSearchResults(fixture('real-player-search.html'), {
      fideId: '5207363',
      today: new Date('2026-09-19T12:00:00Z'),
    });
    assert.ok(found.some((t) => t.id === '1486488'));
    const nobody = parseSearchResults(fixture('real-player-search.html'), {
      fideId: '1',
      today: new Date('2026-09-19T12:00:00Z'),
    });
    assert.equal(nobody.length, 0);
  });

  test('reads the start number out of the row\'s own link', () => {
    const found = parseSearchResults(fixture('real-player-search.html'), {
      fideId: '5207363',
      today: new Date('2026-09-19T12:00:00Z'),
    });
    const event = found.find((t) => t.id === '1486488');
    assert.equal(event.startNo, 2, 'saves the poller a starting-rank download');
    assert.equal(event.fideId, '5207363');
  });

  test('splitName', () => {
    assert.deepEqual(splitName('Suriyajan, Chayapol'), { surname: 'Suriyajan', given: 'Chayapol' });
    assert.deepEqual(splitName('Carlsen'), { surname: 'Carlsen', given: '' });
  });
});

/** A club event that isn't FIDE-rated: the FideID cell is blank or 0 for everyone. */
function unratedPage(rows) {
  const cells = rows
    .map(
      (r) => `<tr><td><a href="tnr${r.id}.aspx?lan=1&art=9&snr=${r.snr}">${r.name}</a></td>` +
        `<td>${r.fide ?? ''}</td><td>PHI</td>` +
        `<td><a href="tnr${r.id}.aspx?lan=1">${r.title}</a></td><td>${r.end}</td></tr>`,
    )
    .join('');
  return `<html><body><table><tr><th>Name</th><th>FideID</th><th>FED</th>` +
    `<td>Tournament</td><td>End-Date</td></tr>${cells}</table>${'x'.repeat(600)}</body></html>`;
}

describe('FIDE-ID search is trusted even when the rows carry no FIDE ID', () => {
  const today = new Date('2026-09-19T12:00:00Z');

  test('keeps rows whose FideID cell is blank or 0', () => {
    const html = unratedPage([
      { id: '900001', snr: 7, name: 'SURIYAJAN, CHAYAPOL', fide: '0', title: 'Club Blitz', end: '2026/09/20' },
      { id: '900002', snr: 3, name: 'Suriyajan, Chayapol', fide: '', title: 'Weekend Open', end: '2026/09/21' },
    ]);
    const found = parseSearchResults(html, { fideId: '6200456', by: 'fide', today });
    assert.deepEqual(found.map((t) => t.id).sort(), ['900001', '900002']);
  });

  test('a wrong FIDE ID still loses to a row that has one', () => {
    const html = unratedPage([
      { id: '900003', snr: 1, name: 'Someone, Else', fide: '1234567', title: 'FIDE Open', end: '2026/09/20' },
    ]);
    assert.equal(parseSearchResults(html, { fideId: '7654321', by: 'fide', today }).length, 0);
  });

  test('a name search still needs the name to match', () => {
    const html = unratedPage([
      { id: '900004', snr: 1, name: 'Someone, Else', fide: '', title: 'FIDE Open', end: '2026/09/20' },
    ]);
    assert.equal(parseSearchResults(html, { playerName: 'Suriyajan, Chayapol', by: 'name', today }).length, 0);
  });

  test('namesMatch forgives word order and missing middle names', () => {
    assert.ok(namesMatch('Suriyajan, Chayapol', 'Chayapol Suriyajan'));
    assert.ok(namesMatch('Suriyajan, Chayapol', 'Suriyajan, Chayapol Ake'));
    assert.ok(namesMatch('Novák, Šimon', 'Novak, Simon'));
    assert.ok(!namesMatch('Suriyajan, Chayapol', 'Suriyajan, Anong'));
    assert.ok(!namesMatch('', 'Suriyajan, Chayapol'));
  });
});

describe('grouping search rows into players (the Events tab search)', () => {
  const row = (extra) => ({ id: '1', label: 'Open', endDate: '2026-09-20', federation: 'PHI', ...extra });

  test('one person per FIDE ID, whatever their name is spelt like that week', () => {
    const players = groupPlayers([
      row({ id: '1', name: 'HABLA, Jony', fideId: '5207363' }),
      row({ id: '2', name: 'Habla, Jony', fideId: '5207363' }),
      row({ id: '3', name: 'Habla, Jun', fideId: '5207999' }),
    ]);
    assert.equal(players.length, 2);
    assert.deepEqual(players[0].tournaments.map((t) => t.id), ['1', '2']);
    assert.equal(players[1].fideId, '5207999');
  });

  test('rows with no FIDE ID group by name, and keep the ID that was searched for', () => {
    const players = groupPlayers(
      [row({ id: '1', name: 'Suriyajan, Chayapol', fideId: null }), row({ id: '2', name: 'Suriyajan, Chayapol', fideId: '0' })],
      '6200456',
    );
    assert.equal(players.length, 1);
    assert.equal(players[0].fideId, '6200456');
    assert.equal(players[0].tournaments.length, 2);
  });
});
