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
import { fetchSchedule as realSchedule } from './chessresults/pages.js';
import { tournamentUrl } from './chessresults/client.js';
import { diffPairings } from './diff.js';
import { buildNotification, sendPush, vapidFromEnv } from './notify.js';
import { buildResultNotification } from './messages.js';
import { dueReminders, timedSchedule } from './reminders.js';
import { readSettings } from './settings.js';

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
/** An event with no activity for this long is deleted from the app. */
export const OLD_EVENT = 14 * DAY;
/** ...and stays deleted this long, so a stray search result can't bring it back. */
const TOMBSTONE = 30 * DAY;

/**
 * Events to delete: nothing has changed for two weeks (the card, or since we first saw
 * it) and no scheduled round is still to come. `schedule` entries carry `at` (ms) once
 * the poller has read the event's schedule.
 */
export function oldEvents(poll, now) {
  const old = new Set();
  for (const [id, meta] of Object.entries(poll.tournaments ?? {})) {
    const last = meta.lastChangeAt ?? meta.firstSeenAt;
    if (!last || now - last <= OLD_EVENT) continue;
    if ((meta.schedule ?? []).some((s) => s.at && s.at > now)) continue;
    old.add(id);
  }
  return old;
}

/**
 * Delete old events everywhere they are kept: pinned on a follow, found by discovery,
 * the cached start numbers, the diff state and the poll bookkeeping. The feed is
 * rebuilt from those, so it drops them too. Returns the follows that changed.
 */
export function pruneOldEvents({ follows, poll, state, now }) {
  poll.deleted ??= {};
  for (const [id, at] of Object.entries(poll.deleted)) if (now - at > TOMBSTONE) delete poll.deleted[id];

  const old = oldEvents(poll, now);
  const changed = [];
  if (old.size === 0) return { removed: old, changed };

  for (const id of old) {
    delete poll.tournaments[id];
    poll.deleted[id] = now;
  }
  for (const key of Object.keys(poll.players ?? {})) {
    if (old.has(key.slice(key.indexOf(':') + 1))) delete poll.players[key];
  }
  for (const record of Object.values(poll.discovery ?? {})) {
    if (record?.found) record.found = record.found.filter((t) => !old.has(t.id));
  }
  for (const key of Object.keys(state.players ?? {})) {
    if (old.has(key.slice(0, key.indexOf(':')))) delete state.players[key];
  }
  for (const follow of follows) {
    const kept = (follow.tournaments ?? []).filter((t) => !old.has(t.id));
    if (kept.length !== (follow.tournaments ?? []).length) {
      follow.tournaments = kept;
      changed.push(follow);
    }
  }
  return { removed: old, changed };
}

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
  fetchSchedule: realSchedule,
};

/** Round times rarely change: read an active event's schedule at most this often. */
const SCHEDULE_REFRESH = 6 * HOUR;
/** Forget sent reminders after this, so the record doesn't grow forever. */
const REMINDER_MEMORY = 2 * DAY;

/**
 * @param {object} deps
 * @param {object} deps.store             see lib/store
 * @param {boolean} [deps.dryRun]         parse and diff, but send nothing and write nothing
 * @param {number} [deps.now]             ms timestamp (tests)
 * @param {object} [deps.fetchers]        chess-results access (tests)
 * @param {Function} [deps.sender]        web-push sender (tests)
 * @param {object|null} [deps.vapid]
 * @param {(msg:string) => void} [deps.log]
 * @param {{fetches:number, started:number}} [deps.budget]  shared by every account in one tick
 */
export async function runPoll({
  store,
  dryRun = false,
  now = Date.now(),
  fetchers = defaultFetchers,
  sender,
  vapid = vapidFromEnv(),
  log = console.log,
  budget = { fetches: 0, started: Date.now() },
}) {
  const outOfTime = () => Date.now() - budget.started > TIME_BUDGET;
  const fetchesBefore = budget.fetches;
  // A page another account already fetched this tick costs chess-results nothing.
  const count = (result) => {
    if (!result?.fromCache) budget.fetches++;
    return result;
  };
  const nowIso = new Date(now).toISOString();

  const follows = await store.listFollows();
  const poll = (await store.get('poll')) ?? {};
  poll.tournaments ??= {}; // id -> {title, lastPolledAt, lastChangeAt}
  poll.players ??= {}; // "followId:tournamentId" -> {startNo, playerName} | {notIn, at}
  poll.discovery ??= {}; // followId -> {at, found:[{id,label}], error}
  const previousFeed = (await store.get('feed')) ?? { follows: [] };
  const previousEntry = (followId, tournamentId) =>
    previousFeed.follows?.find((f) => f.id === followId)?.tournaments?.find((t) => t.id === tournamentId) ?? null;
  const previousState = (await store.get('state')) ?? { version: 1, players: {} };

  // ---- 0. Delete events that ended more than two weeks ago --------------------------
  const pruned = pruneOldEvents({ follows, poll, state: previousState, now });
  if (pruned.removed.size) log(`deleted ${pruned.removed.size} old event(s): ${[...pruned.removed].join(', ')}`);
  if (!dryRun) for (const follow of pruned.changed) await store.saveFollow(follow);

  const errors = [];

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
    const found = (poll.discovery[follow.id]?.found ?? [])
      .filter((t) => !poll.deleted[t.id])
      .map((t) => ({ ...t, pinned: false }));
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
    if (budget.fetches >= MAX_FETCHES || outOfTime()) {
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
          rankCache.set(tournament.id, count(await fetchers.fetchStartingRank(tournament.id)));
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

      const { rounds, title } = count(await fetchers.fetchPlayerCard(tournament.id, player.startNo));
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

  // ---- 3b. Round times, for reminders (and for keeping a not-yet-started event) ------
  const settings = await readSettings(store);
  if (fetchers.fetchSchedule) {
    for (const id of polledNow) {
      const meta = poll.tournaments[id];
      if (meta.scheduleAt && now - meta.scheduleAt < SCHEDULE_REFRESH) continue;
      if (budget.fetches >= MAX_FETCHES || outOfTime()) break;
      try {
        const schedule = count(await fetchers.fetchSchedule(id));
        meta.schedule = (Array.isArray(schedule) ? schedule : []).map(({ round, date, time }) => ({ round, date, time }));
        meta.scheduleAt = now;
      } catch (error) {
        log(`! schedule ${id}: ${error.message}`);
      }
    }
  }
  for (const meta of Object.values(poll.tournaments)) {
    if (meta.schedule) meta.schedule = timedSchedule(meta.schedule, settings.timeZone);
  }

  // ---- 4. Diff and push ---------------------------------------------------------------
  const { newPairings, newResults, nextState, seeded } = diffPairings(previousState, observations);
  if (seeded.length) log(`seeded ${seeded.length} player/tournament pair(s) silently`);
  log(
    `${observations.length} observed, ${newPairings.length} new pairing(s), ${newResults.length} new result(s), ${carried.length} deferred`,
  );

  // Reminders: every followed event we know about, polled this tick or not.
  poll.reminders ??= {};
  for (const [key, at] of Object.entries(poll.reminders)) if (now - at > REMINDER_MEMORY) delete poll.reminders[key];
  const reminderItems = [];
  for (const { follow, tournament } of work) {
    const player = poll.players[`${follow.id}:${tournament.id}`];
    const meta = poll.tournaments[tournament.id];
    if (!player?.startNo || !meta?.schedule) continue;
    const fresh = observations.find((o) => o.followId === follow.id && o.tournamentId === tournament.id);
    reminderItems.push({
      follow,
      tournamentId: tournament.id,
      title: meta.title ?? null,
      startNo: player.startNo,
      playerName: player.playerName,
      rounds: fresh?.rounds ?? previousEntry(follow.id, tournament.id)?.rounds ?? [],
      schedule: meta.schedule,
    });
  }
  const reminders = dueReminders({ items: reminderItems, settings, sent: poll.reminders, now });
  for (const { key } of reminders) poll.reminders[key] = now;

  let push = { sent: 0, failed: 0, expired: [] };
  const pairingAlerts = newPairings.map(buildNotification);
  const resultAlerts = newResults.map((item) => buildResultNotification(item, settings)).filter(Boolean);
  const reminderAlerts = reminders.map((r) => r.payload);
  const notifications = [...pairingAlerts, ...resultAlerts, ...reminderAlerts];
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
    fetches: budget.fetches - fetchesBefore,
    newPairings: pairingAlerts,
    newResults: resultAlerts,
    reminders: reminderAlerts,
    seeded,
    push,
    errors,
    dryRun,
  };
}

/**
 * Wrap the chess-results fetchers so a page is fetched at most once per tick, however
 * many accounts follow the same player. Repeats come back marked `fromCache`, which
 * runPoll does not count against the tick's request budget.
 */
export function sharedFetchers(fetchers) {
  const memo = (fn, keyOf) => {
    const cache = new Map();
    return async (...args) => {
      const key = keyOf(...args);
      if (cache.has(key)) {
        const hit = await cache.get(key);
        return Array.isArray(hit) ? Object.assign([...hit], { fromCache: true }) : { ...hit, fromCache: true };
      }
      const pending = fn(...args);
      cache.set(key, pending);
      try {
        return await pending;
      } catch (error) {
        cache.delete(key); // don't remember a failure for the others
        throw error;
      }
    };
  };
  return {
    ...fetchers,
    fetchStartingRank: memo(fetchers.fetchStartingRank, (id) => id),
    fetchPlayerCard: memo(fetchers.fetchPlayerCard, (id, startNo) => `${id}:${startNo}`),
    ...(fetchers.fetchSchedule && { fetchSchedule: memo(fetchers.fetchSchedule, (id) => id) }),
  };
}

/**
 * One tick for every account: the owner and everyone they invited. They share one
 * request budget and one page cache, so inviting friends doesn't multiply the load on
 * chess-results. The order rotates every minute so nobody's alerts always wait for
 * everyone else's.
 *
 * @param {object} deps  as runPoll, plus `stores` (one scoped store per account)
 */
export async function runPollForAll({ stores, fetchers = defaultFetchers, now = Date.now(), ...deps }) {
  const budget = { fetches: 0, started: Date.now() };
  const shared = sharedFetchers(fetchers);
  const shift = stores.length ? Math.floor(now / MINUTE) % stores.length : 0;
  const order = [...stores.slice(shift), ...stores.slice(0, shift)];

  const results = {};
  for (const store of order) {
    try {
      results[store.userId] = await runPoll({ ...deps, store, now, fetchers: shared, budget });
    } catch (error) {
      results[store.userId] = { error: error.message };
    }
  }
  return { fetches: budget.fetches, accounts: results };
}
