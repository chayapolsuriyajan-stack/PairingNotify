#!/usr/bin/env node
/**
 * PairingNotify poller — the whole backend.
 *
 * Run by .github/workflows/poll.yml on a schedule:
 *   1. read watchlist.json
 *   2. build the tournament set (pinned + auto-discovered)
 *   3. resolve our start number in each, then fetch the player card
 *   4. diff against data/state.json
 *   5. push anything new
 *   6. write data/pairings.json + data/state.json (the workflow commits only on change)
 *
 * Pass --dry-run to do everything except send pushes.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { discoverTournaments } from './chessresults/search.js';
import { fetchStartingRank, findPlayer } from './chessresults/tournament.js';
import { fetchPlayerCard } from './chessresults/playercard.js';
import { tournamentUrl } from './chessresults/client.js';
import { diffPairings } from './diff.js';
import { sendPairingNotifications } from './notify.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WATCHLIST = join(ROOT, 'watchlist.json');
const STATE_FILE = join(ROOT, 'data', 'state.json');
const FEED_FILE = join(ROOT, 'data', 'pairings.json');

const DRY_RUN = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw new Error(`${path} is unreadable: ${error.message}`);
  }
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/** Pinned tournaments always count; discovery is best-effort on top. */
async function collectTournaments(watchlist) {
  const pinned = (watchlist.tournaments ?? [])
    .filter((t) => t?.id && t.enabled !== false)
    .map((t) => ({ id: String(t.id), label: t.label ?? `Tournament ${t.id}`, source: 'pinned' }));

  const byId = new Map(pinned.map((t) => [t.id, t]));
  let discoveryError = null;

  if (watchlist.autoDiscover !== false && watchlist.playerName) {
    try {
      const found = await discoverTournaments({ playerName: watchlist.playerName });
      console.log(`Auto-discovery found ${found.length} tournament(s).`);
      for (const tournament of found) {
        if (!byId.has(tournament.id)) {
          byId.set(tournament.id, { ...tournament, source: 'discovered' });
        }
      }
    } catch (error) {
      // Deliberately non-fatal: pinned tournaments must keep working when the
      // search page changes shape. The PWA surfaces this as a banner.
      discoveryError = error.message;
      console.warn(`! Auto-discovery failed: ${error.message}`);
      console.warn('  Continuing with pinned tournaments only.');
    }
  }

  return { tournaments: [...byId.values()], discoveryError };
}

async function observeTournament(tournament, watchlist) {
  console.log(`\n[${tournament.id}] ${tournament.label} (${tournament.source})`);

  const { title, players } = await fetchStartingRank(tournament.id);
  const match = findPlayer(players, {
    playerName: watchlist.playerName,
    fideId: watchlist.fideId,
  });

  if (!match) {
    console.log(`  "${watchlist.playerName}" is not in this tournament's ${players.length}-player list — skipping.`);
    return null;
  }
  if (match.matchedBy === 'partial') {
    console.warn(`  ! Matched "${match.player.name}" by partial name. Set fideId to be certain.`);
  }
  console.log(`  Matched ${match.player.name} at start number ${match.player.startNo} (by ${match.matchedBy}).`);

  const { rounds } = await fetchPlayerCard(tournament.id, match.player.startNo);
  const paired = rounds.filter((r) => r.paired);
  console.log(`  ${rounds.length} round row(s), ${paired.length} paired.`);

  return {
    tournamentId: tournament.id,
    tournamentTitle: title ?? tournament.label,
    url: tournamentUrl(tournament.id, { art: '9', snr: String(match.player.startNo) }),
    startNo: match.player.startNo,
    playerName: match.player.name,
    rounds,
  };
}

async function main() {
  console.log(`PairingNotify poll at ${new Date().toISOString()}${DRY_RUN ? ' (dry run)' : ''}`);

  const watchlist = await readJson(WATCHLIST, null);
  if (!watchlist?.playerName && !watchlist?.fideId) {
    throw new Error('watchlist.json must set "playerName" (and ideally "fideId").');
  }

  const { tournaments, discoveryError } = await collectTournaments(watchlist);
  if (tournaments.length === 0) {
    console.warn('! Nothing to poll: no pinned tournaments and discovery found none.');
  }

  const observations = [];
  const errors = [];
  for (const tournament of tournaments) {
    try {
      const observation = await observeTournament(tournament, watchlist);
      if (observation) observations.push(observation);
    } catch (error) {
      // One broken tournament must not stop the others.
      errors.push({ tournamentId: tournament.id, message: error.message });
      console.error(`  ! ${error.message}`);
    }
  }

  const previousState = await readJson(STATE_FILE, { version: 1, players: {} });
  const { newPairings, nextState, seeded } = diffPairings(previousState, observations);

  if (seeded.length > 0) {
    console.log(`\nSeeded ${seeded.length} new player/tournament pair(s) without notifying.`);
  }
  console.log(`${newPairings.length} new pairing(s).`);

  let push = { sent: 0, failed: 0, subscriptionExpired: false };
  if (newPairings.length > 0 && !DRY_RUN) {
    push = await sendPairingNotifications(newPairings);
  } else if (newPairings.length > 0) {
    console.log('Dry run — not sending push. Would have sent:');
    for (const pairing of newPairings) {
      console.log(`  Round ${pairing.round} Board ${pairing.board} vs ${pairing.opponent} (${pairing.rating})`);
    }
  }

  const feed = {
    generatedAt: new Date().toISOString(),
    player: watchlist.playerName,
    searchDegraded: Boolean(discoveryError),
    discoveryError,
    errors,
    tournaments: observations.map((observation) => ({
      id: observation.tournamentId,
      title: observation.tournamentTitle,
      url: observation.url,
      startNo: observation.startNo,
      playerName: observation.playerName,
      rounds: observation.rounds,
      latestPaired: [...observation.rounds].reverse().find((round) => round.paired) ?? null,
    })),
  };

  if (DRY_RUN) {
    console.log('\nDry run — not writing data files.');
  } else {
    await writeJson(FEED_FILE, feed);
    await writeJson(STATE_FILE, nextState);
    console.log('\nWrote data/pairings.json and data/state.json.');
  }

  if (push.subscriptionExpired) process.exitCode = 0; // reported loudly, not a build failure
  if (errors.length > 0 && observations.length === 0) {
    throw new Error(`Every tournament failed to poll (${errors.length}).`);
  }
}

main().catch((error) => {
  console.error(`\nPoll failed: ${error.message}`);
  process.exitCode = 1;
});
