import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildSearchForm, parseSearchResults, splitName } from '../chessresults/search.js';

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

  test('splitName', () => {
    assert.deepEqual(splitName('Suriyajan, Chayapol'), { surname: 'Suriyajan', given: 'Chayapol' });
    assert.deepEqual(splitName('Carlsen'), { surname: 'Carlsen', given: '' });
  });
});
