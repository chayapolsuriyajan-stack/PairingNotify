#!/usr/bin/env node
/**
 * Dump raw chess-results HTML so the parsers can be developed and tested offline.
 *
 * Run from .github/workflows/capture-fixtures.yml (GitHub runners can reach
 * chess-results; some development sandboxes cannot). It also tries to parse what it
 * downloads, so the workflow log tells you immediately whether the parsers work
 * against today's markup.
 *
 *   node scripts/capture-fixtures.js --tournament 1146458 --name "Suriyajan, Chayapol"
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchHtml, tournamentUrl } from './chessresults/client.js';
import { parseStartingRank, parseTournamentTitle, findPlayer } from './chessresults/tournament.js';
import { parsePlayerCard } from './chessresults/playercard.js';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'captured');

function arg(flag, fallback = null) {
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function save(name, html) {
  await mkdir(OUT, { recursive: true });
  await writeFile(join(OUT, name), html, 'utf8');
  console.log(`  saved ${name} (${html.length} bytes)`);
}

/** Try a parser and report clearly, without aborting the rest of the capture. */
function attempt(label, fn) {
  try {
    const result = fn();
    console.log(`  PARSE OK  ${label}`);
    return result;
  } catch (error) {
    console.error(`  PARSE FAIL ${label}: ${error.message}`);
    return null;
  }
}

async function main() {
  const tournamentId = arg('--tournament');
  const playerName = arg('--name');
  if (!tournamentId) throw new Error('Pass --tournament <id>');

  console.log(`Capturing tournament ${tournamentId}...`);

  const startingRankHtml = await fetchHtml(
    tournamentUrl(tournamentId, { art: '1', flag: '30', zeilen: '99999' }),
  );
  await save('starting-rank.html', startingRankHtml);
  console.log(`  title: ${attempt('parseTournamentTitle', () => parseTournamentTitle(startingRankHtml))}`);
  const players = attempt('parseStartingRank', () => parseStartingRank(startingRankHtml));
  if (players) console.log(`  ${players.length} players; first: ${JSON.stringify(players[0])}`);

  let startNo = arg('--snr');
  if (!startNo && players && playerName) {
    const match = attempt('findPlayer', () => findPlayer(players, { playerName }));
    if (match) {
      startNo = String(match.player.startNo);
      console.log(`  matched ${match.player.name} -> start number ${startNo} (${match.matchedBy})`);
    } else {
      console.error(`  findPlayer: "${playerName}" not found. Pass --snr <n> instead.`);
    }
  }
  if (!startNo) startNo = '1';

  const cardHtml = await fetchHtml(tournamentUrl(tournamentId, { art: '9', snr: startNo }));
  await save('player-card.html', cardHtml);
  const rounds = attempt('parsePlayerCard', () => parsePlayerCard(cardHtml));
  if (rounds) console.log(`  rounds:\n${JSON.stringify(rounds, null, 2)}`);

  const roundHtml = await fetchHtml(tournamentUrl(tournamentId, { art: '2', rd: '1', flag: '30' }));
  await save('round-pairings.html', roundHtml);

  const searchHtml = await fetchHtml('SpielerSuche.aspx?lan=1');
  await save('player-search.html', searchHtml);

  console.log(
    '\nDone. Download the artifact, copy the HTML into scripts/__fixtures__/, and ' +
      'fix any PARSE FAIL above before trusting the poller.',
  );
}

main().catch((error) => {
  console.error(`Capture failed: ${error.message}`);
  process.exit(1);
});
