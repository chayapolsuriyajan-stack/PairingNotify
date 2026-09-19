import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTournamentRef, isTournamentId } from '../ref.js';

test('accepts a bare id, a full link and a mirror-server link', () => {
  assert.deepEqual(parseTournamentRef(' 1486488 '), { id: '1486488', startNo: null });
  assert.deepEqual(
    parseTournamentRef('https://chess-results.com/tnr1486488.aspx?lan=1&art=9&snr=5'),
    { id: '1486488', startNo: 5 },
  );
  assert.deepEqual(parseTournamentRef('https://S3.chess-results.com/tnr1499564.aspx?lan=1&SNode=S0'), {
    id: '1499564',
    startNo: null,
  });
});

test('rejects anything else', () => {
  assert.equal(parseTournamentRef('bangkok open'), null);
  assert.equal(parseTournamentRef(''), null);
  assert.equal(isTournamentId('12; DROP'), false);
});
