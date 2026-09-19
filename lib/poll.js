/**
 * One poll tick, called by /api/poll (cron-job.org every 1–2 minutes).
 *
 *   follows (store) ──► tournaments (pinned + discovered)
 *        └─► start number (cached) ──► player card ──► diff ──► push to every device
 *
 * Politeness to chess-results is the main design constraint:
 *  - start numbers are cached, so a normal tick is ONE request per player/tournament;
 *  - auto-discovery (several requests, the fragile part) runs at most every 30 min;
 *  - tournaments that haven't changed for hours are polled less and less often;
 *  - a tick does at most MAX_FETCHES observations and stops early near its time limit.
 */

import { discoverTournaments as realDiscover } from './chessresults/search.js';
import { fetchStartingRank as realStartingRank, findPlayer } from './chessresults/tournament.js';
import { fetchPlayerCard as realPlayerCard } from './chessresults/playercard.js';
import { tournamentUrl } from './chessresults/client.js';
import { diffPairings } from './diff.js';
import { buildNotification, sendPush, vapidFromEnv } from './notify.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DISCOVERY_EVERY = 30 * MINUTE;
const NOT_IN_RECHECK = 24 * HOUR;
const MAX_FETCHES = 10;
const TIME_BUDGET = 45_000;

/**
 * How long to wait between polls of a tournament, from how long it has been quiet.
 * Active events are polled every tick; a finished event drops to a few times a day.
 */
export function pollInterval(quietFor) {
  if (quietFor < 6 * HOUR) return 0;
  if (quietFor < 3 * 24 * HOUR) return 15 * MINUTE;
  return 6 * HOUR;
}

const defaultFetchers = {
  discoverTournaments: realDiscover,
  fetchStartingRank: realStartingRank,
  fetchPlayerCard: realPlayerCard,
};

/**
 * @param {object} deps
 * @param {object} deps.store             see lib/store
 * @param {boolean} [deps.dryRun]         parse and diff, but send nothing and write nothing
 * @param {number} [deps.now]             ms timestamp (tests)
 * @param {object} [deps.fetchers]        chess-results access (tests)
 * @param {Function} [deps.sender]        web-push sender (tests)
 * @param {object|null} [deps.vapid]
 * @param {(msg:string) => void} [deps.log]
 */
export async function runPoll({
  store,
  dryRun = false,
  now = Date.now(),
  fetchers = defaultFetchers,
  sender,
  vapid = vapidFromEnv(),
  log = console.log,
}) {
  const started = Date.now();
  const outOfTime = () => Date.now() - started > TIME_BUDGET;
  const nowIso = new Date(now).toISOString();

  const follows = await store.listFollows();
  const poll = (await store.get('poll')) ?? {};
  poll.tournaments ??= {}; // id -> {title, lastPolledAt, lastChangeAt}
  poll.players ??= {}; // "followId:tournamentId" -> {startNo, playerName} | {notIn, at}
  poll.discovery ??= {}; // followId -> {at, found:[{id,label}], error}
  const previousFeed = (await store.get('feed')) ?? { follows: [] };
  const previousEntry = (followId, tournamentId) =>
    previousFeed.follows?.find((f) => f.id === followId)?.tournaments?.find((t) => t.id === tournamentId) ?? null;

  const errors = [];
  let fetches = 0;

  // ---- 1. Which tournaments does each follow have? -------------------------------
  for (const follow of follows) {
    if (!follow.autoDiscover || !follow.playerName) continue;
    const last = poll.discovery[follow.id];
    if (last && now - last.at < DISCOVERY_EVERY) continue;
    if (outOfTime()) break;
    try {
      const found = await fetchers.discoverTournaments({ playerName: follow.playerName });
      poll.discovery[follow.id] = { at: now, found, error: null };
      log(`discovery: ${follow.playerName} -> ${found.length} tournament(s)`);
    } catch (error) {
      // Non-fatal: pinned tournaments keep working. The app shows a banner.
      poll.discovery[follow.id] = { at: now, found: last?.found ?? [], error: error.message };
      log(`! discovery failed for ${follow.playerName}: ${error.message}`);
    }
  }

  const work = [];
  for (const follow of follows) {
    const pinned = (follow.tournaments ?? []).map((t) => ({ ...t, pinned: true }));
    const found = (poll.discovery[follow.id]?.found ?? []).map((t) => ({ ...t, pinned: false }));
    const seen = new Set();
    for (const t of [...pinned, ...found]) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      work.push({ follow, tournament: t });
    }
  }

  // ---- 2. Decide what is due this tick ----------------------------------------------
  const due = [];
  const carried = [];
  for (const item of work) {
    const key = `${item.follow.id}:${item.tournament.id}`;
    const player = poll.players[key];
    const meta = poll.tournaments[item.tournament.id] ?? {};
    if (player?.notIn && now - player.at < NOT_IN_RECHECK) continue;

    const quietFor = now - (meta.lastChangeAt ?? meta.firstSeenAt ?? now);
    const isDue = !meta.lastPolledAt || now - meta.lastPolledAt >= pollInterval(quietFor);
    (isDue ? due : carried).push(item);
  }
  // Pinned and recently active first; never-polled before long-idle ones.
  due.sort((a, b) => {
    const ma = poll.tournaments[a.tournament.id] ?? {};
    const mb = poll.tournaments[b.tournament.id] ?? {};
    return (
      Number(b.tournament.pinned) - Number(a.tournament.pinned) ||
      (mb.lastChangeAt ?? 0) - (ma.lastChangeAt ?? 0) ||
      (ma.lastPolledAt ?? 0) - (mb.lastPolledAt ?? 0)
    );
  });

  // ---- 3. Observe ---------------------------------------------------------------------
  const observations = [];
  const rankCache = new Map();
  const polledNow = new Set();

  for (const item of due) {
    if (fetches >= MAX_FETCHES || outOfTime()) {
      carried.push(item);
      continue;
    }
    const { follow, tournament } = item;
    const key = `${follow.id}:${tournament.id}`;
    try {
      let player = poll.players[key];
      if (!player || player.notIn) {
        if (!rankCache.has(tournament.id)) {
          rankCache.set(tournament.id, await fetchers.fetchStartingRank(tournament.id));
          fetches++;
        }
        const { title, players } = rankCache.get(tournament.id);
        poll.tournaments[tournament.id] = { firstSeenAt: now, ...poll.tournaments[tournament.id], title };
        const match = findPlayer(players, { playerName: follow.playerName, fideId: follow.fideId });
        if (!match) {
          poll.players[key] = { notIn: true, at: now };
          log(`${tournament.id}: ${follow.playerName} not in the ${players.length}-player list`);
          continue;
        }
        player = { startNo: match.player.startNo, playerName: match.player.name, matchedBy: match.matchedBy };
        poll.players[key] = player;
      }

      const { rounds } = await fetchers.fetchPlayerCard(tournament.id, player.startNo);
      fetches++;
      polledNow.add(tournament.id);

      const meta = poll.tournaments[tournament.id] ?? { firstSeenAt: now };
      const before = previousEntry(follow.id, tournament.id);
      if (!before || JSON.stringify(before.rounds) !== JSON.stringify(rounds)) meta.lastChangeAt = now;
      poll.tournaments[tournament.id] = meta;

      observations.push({
        followId: follow.id,
        isMe: Boolean(follow.isMe),
        tournamentId: tournament.id,
        tournamentTitle: meta.title ?? tournament.label ?? `Tournament ${tournament.id}`,
        url: tournamentUrl(tournament.id, { art: '9', snr: String(player.startNo) }),
        startNo: player.startNo,
        playerName: player.playerName,
        rounds,
      });
    } catch (error) {
      // One broken tournament must not stop the others.
      errors.push({ followId: follow.id, tournamentId: tournament.id, message: error.message });
      log(`! ${tournament.id} (${follow.playerName}): ${error.message}`);
    }
  }
  for (const id of polledNow) poll.tournaments[id].lastPolledAt = now;

  // ---- 4. Diff and push ---------------------------------------------------------------
  const previousState = (await store.get('state')) ?? { version: 1, players: {} };
  const { newPairings, nextState, seeded } = diffPairings(previousState, observations);
  if (seeded.length) log(`seeded ${seeded.length} player/tournament pair(s) silently`);
  log(`${observations.length} observed, ${newPairings.length} new pairing(s), ${carried.length} deferred`);

  let push = { sent: 0, failed: 0, expired: [] };
  const notifications = newPairings.map(buildNotification);
  if (!dryRun && notifications.length > 0) {
    push = await sendPush(await store.listSubscriptions(), notifications, { vapid, sender });
    for (const endpoint of push.expired) await store.removeSubscription(endpoint);
  }

  // ---- 5. Feed for the app (carry forward whatever wasn't polled this tick) ----------
  const feed = {
    generatedAt: nowIso,
    follows: follows.map((follow) => {
      const tournaments = [];
      for (const { follow: f, tournament } of work) {
        if (f.id !== follow.id) continue;
        const fresh = observations.find((o) => o.followId === follow.id && o.tournamentId === tournament.id);
        const entry = fresh
          ? {
              id: tournament.id,
              title: fresh.tournamentTitle,
              url: fresh.url,
              startNo: fresh.startNo,
              playerName: fresh.playerName,
              pinned: tournament.pinned,
              rounds: fresh.rounds,
              latestPaired: [...fresh.rounds].reverse().find((r) => r.paired) ?? null,
            }
          : previousEntry(follow.id, tournament.id);
        if (!entry) continue;
        entry.lastChangeAt = poll.tournaments[tournament.id]?.lastChangeAt ?? null;
        tournaments.push(entry);
      }
      // Most recently active first.
      tournaments.sort((a, b) => (b.lastChangeAt ?? 0) - (a.lastChangeAt ?? 0));
      return {
        id: follow.id,
        playerName: follow.playerName,
        isMe: Boolean(follow.isMe),
        discoveryError: poll.discovery[follow.id]?.error ?? null,
        tournaments,
      };
    }),
    errors,
  };

  if (!dryRun) {
    await store.set('state', nextState);
    await store.set('poll', poll);
    await store.set('feed', feed);
  }

  return {
    observed: observations.length,
    deferred: carried.length,
    fetches,
    newPairings: notifications,
    seeded,
    push,
    errors,
    dryRun,
  };
}
