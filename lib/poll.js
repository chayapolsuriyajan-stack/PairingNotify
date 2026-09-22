/**
 * One poll tick, called by /api/poll (cron-job.org every 1–2 minutes).
 *
 *   follows (store) ──► tournaments (pinned + discovered)
 *        └─► start number (cached) ──► player card ──► diff ──► push to every device
 *
 * Politeness to chess-results is the main design constraint:
 *  - start numbers are cached, so a normal tick is ONE request per player/tournament;
 *  - auto-discovery (several requests, the fragile part) runs daily, or every 30 min
 *    while the player has an event that moved today;
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
const DAY = 24 * HOUR;
/** Player search while the player has an event that moved in the last day. */
const DISCOVERY_ACTIVE = 30 * MINUTE;
/** Otherwise: once a day is enough to catch a tournament you just entered. */
const DISCOVERY_IDLE = DAY;
/** chess-results was unreachable or the search page changed: try again soon-ish. */
const DISCOVERY_RETRY = 2 * HOUR;
const ACTIVE_WINDOW = DAY;
const NOT_IN_RECHECK = 24 * HOUR;
const MAX_FETCHES = 10;
const TIME_BUDGET = 45_000;

/**
 * How long to wait before searching chess-results for a player's new tournaments.
 *
 * The search is the expensive, fragile part of a tick (two requests, one of them a
 * WebForms POST), so it runs on its own clock: every half hour while the player has an
 * event that moved today — a weekend open often has its next event published mid-way —
 * and once a day otherwise. Nothing here affects how often an event you are already
 * watching is polled.
 *
 * @param {{lastChangeAt?:number|null, failed?:boolean, now:number}} state
 */
export function discoveryInterval({ lastChangeAt = null, failed = false, now }) {
  if (failed) return DISCOVERY_RETRY;
  if (lastChangeAt && now - lastChangeAt < ACTIVE_WINDOW) return DISCOVERY_ACTIVE;
  return DISCOVERY_IDLE;
}

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
    if (!follow.autoDiscover || (!follow.playerName && !follow.fideId)) continue;
    const last = poll.discovery[follow.id];
    // "Find my events now" deletes the record, which makes the follow due immediately.
    const lastChangeAt = Math.max(
      0,
      ...(previousFeed.follows?.find((f) => f.id === follow.id)?.tournaments ?? []).map((t) => t.lastChangeAt ?? 0),
    );
    if (last && now - last.at < discoveryInterval({ lastChangeAt, failed: Boolean(last.error), now })) continue;
    if (outOfTime()) break;
    try {
      const found = await fetchers.discoverTournaments({ playerName: follow.playerName, fideId: follow.fideId });
      poll.discovery[follow.id] = {
        at: now,
        found,
        error: null,
        nextAt: now + discoveryInterval({ lastChangeAt, now }),
      };
      log(`discovery: ${follow.playerName ?? `FIDE ${follow.fideId}`} -> ${found.length} tournament(s)`);
    } catch (error) {
      // Non-fatal: pinned tournaments keep working. The app shows a banner.
      poll.discovery[follow.id] = {
        at: now,
        found: last?.found ?? [],
        error: error.message,
        nextAt: now + DISCOVERY_RETRY,
      };
      log(`! discovery failed for ${follow.playerName ?? follow.fideId}: ${error.message}`);
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
      if ((!player || player.notIn) && tournament.startNo) {
        // The search result linked straight to this player's card, so the start number
        // is already known and the starting-rank page can be skipped entirely. It also
        // can't be missed by a name that is spelt differently in this event's list.
        player = { startNo: tournament.startNo, playerName: tournament.name || follow.playerName, matchedBy: 'search' };
        poll.players[key] = player;
      }
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

      const { rounds, title } = await fetchers.fetchPlayerCard(tournament.id, player.startNo);
      fetches++;
      polledNow.add(tournament.id);

      const meta = poll.tournaments[tournament.id] ?? { firstSeenAt: now };
      // The card page names the event too, so a tournament found by search gets its
      // real title rather than the 30-character stub the search result table shows.
      if (title) meta.title = title;
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
        discoveryAt: poll.discovery[follow.id]?.at ?? null,
        discoveryNextAt: poll.discovery[follow.id]?.nextAt ?? null,
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
