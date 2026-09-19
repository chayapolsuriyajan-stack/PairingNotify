#!/usr/bin/env node
/**
 * Dump raw chess-results HTML so the parsers can be developed and tested offline.
 *
 * Run locally or from .github/workflows/capture-fixtures.yml. It parses everything it
 * downloads with every parser the app uses, so the log tells you immediately whether
 * any of them has drifted from today's markup.
 *
 *   node scripts/capture-fixtures.js --tournament 1146458 --name "Suriyajan, Chayapol"
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchHtml, tournamentUrl } from '../lib/chessresults/client.js';
import { parseStartingRank, parseTournamentTitle, findPlayer } from '../lib/chessresults/tournament.js';
import { parsePlayerCard } from '../lib/chessresults/playercard.js';
import {
  parsePairings,
  parseStandings,
  parseCrosstable,
  parseSchedule,
  parseDetails,
  parseMenu,
  parsePlayerHeader,
} from '../lib/chessresults/pages.js';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', '__fixtures__', 'captured');

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
    tournamentUrl(tournamentId, { art: '0', flag: '30', zeilen: '99999' }),
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

  attempt('parsePlayerHeader', () => console.log(`  header: ${JSON.stringify(parsePlayerHeader(cardHtml))}`));

  const crossHtml = await fetchHtml(tournamentUrl(tournamentId, { art: '5', flag: '30', zeilen: '99999' }));
  await save('crosstable.html', crossHtml);
  const cross = attempt('parseCrosstable', () => parseCrosstable(crossHtml));
  if (cross) console.log(`  ${cross.players.length} players, ${cross.rounds} round column(s)`);
  attempt('parseDetails', () => console.log(`  details: ${JSON.stringify(parseDetails(crossHtml))}`));
  const menu = attempt('parseMenu', () => parseMenu(crossHtml));
  if (menu) console.log(`  menu: ${JSON.stringify(menu)}`);
  const round = String(menu?.currentRound ?? 1);

  const roundHtml = await fetchHtml(tournamentUrl(tournamentId, { art: '2', rd: round, flag: '30' }));
  await save(`round-${round}-pairings.html`, roundHtml);
  attempt('parsePairings', () => console.log(`  ${parsePairings(roundHtml).length} boards in round ${round}`));

  const standingsHtml = await fetchHtml(tournamentUrl(tournamentId, { art: '1', rd: round, flag: '30' }));
  await save(`round-${round}-standings.html`, standingsHtml);
  attempt('parseStandings', () => console.log(`  ${parseStandings(standingsHtml).length} standings rows`));

  const scheduleHtml = await fetchHtml(tournamentUrl(tournamentId, { art: '14', flag: '30' }));
  await save('schedule.html', scheduleHtml);
  attempt('parseSchedule', () => console.log(`  schedule: ${JSON.stringify(parseSchedule(scheduleHtml))}`));

  const searchHtml = await fetchHtml('SpielerSuche.aspx?lan=1');
  await save('player-search.html', searchHtml);

  console.log(
    '\nDone. Download the artifact, copy the HTML into lib/__fixtures__/, and ' +
      'fix any PARSE FAIL above before trusting the app.',
  );
}

main().catch((error) => {
  console.error(`Capture failed: ${error.message}`);
  process.exit(1);
});
