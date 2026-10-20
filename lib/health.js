/**
 * Is the poller alive? Every alert depends on cron-job.org calling /api/poll each
 * minute; if that stops (a paused job, a CRON_SECRET mismatch, Vercel down), alerts
 * stop with nothing on screen to say so. So every run leaves a heartbeat, the app
 * shows a banner when it goes quiet, and the owner gets one push when it stalls and
 * one when it comes back.
 *
 * The stall push can't come from the poller (it isn't running), so it is checked
 * whenever someone opens the app, and once a day by Vercel's own cron (/api/watchdog).
 */

import { sendPush } from './notify.js';

const KEY = 'pn:health';
/** No run for this long: show the banner. */
export const STALE_AFTER = 5 * 60_000;
/** ...and this long: push the owner (cron-job.org's own retries have had time). */
export const ALERT_AFTER = 10 * 60_000;

/** @returns {Promise<{lastRunAt:number|null, lastOkAt:number|null, lastError:string|null, alertedAt:number|null}>} */
export async function readHealth(raw) {
  return { lastRunAt: null, lastOkAt: null, lastError: null, alertedAt: null, ...((await raw.get(KEY)) ?? {}) };
}

export function isStale(health, now = Date.now(), after = STALE_AFTER) {
  return health.lastRunAt != null && now - health.lastRunAt > after;
}

const hhmm = (ms, zone) => {
  try {
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: zone ?? undefined }).format(ms);
  } catch {
    return new Date(ms).toISOString().slice(11, 16) + ' UTC';
  }
};

/**
 * Record one poll run. If the owner had been told the poller stalled, tell them it's
 * back. `notify(payload)` pushes to the owner's devices.
 *
 * @param {object} raw
 * @param {{ok: boolean, error?: string|null, now?: number, notify?: ((payload: object) => Promise<unknown>)|null}} run
 */
export async function recordRun(raw, { ok, error = null, now = Date.now(), notify = null }) {
  const health = await readHealth(raw);
  const next = { ...health, lastRunAt: now };
  if (ok) {
    next.lastOkAt = now;
    next.lastError = null;
    if (health.alertedAt && notify) {
      await notify({ title: 'Alerts are back on', body: 'The poller is running again.', tag: 'poller-health', url: '/settings' });
    }
    next.alertedAt = null;
  } else {
    next.lastError = String(error ?? 'unknown error').slice(0, 300);
  }
  await raw.set(KEY, next);
  return next;
}

/**
 * Push the owner once per outage when the poller has been quiet too long.
 * @param {object} raw
 * @param {{now?: number, notify: (payload: object) => Promise<unknown>, timeZone?: string|null}} options
 * @returns {Promise<'ok'|'never-ran'|'alerted'|'already-alerted'>}
 */
export async function watchdog(raw, { now = Date.now(), notify, timeZone = null }) {
  const health = await readHealth(raw);
  if (health.lastRunAt == null) return 'never-ran';
  if (!isStale(health, now, ALERT_AFTER)) return 'ok';
  if (health.alertedAt && health.alertedAt >= health.lastRunAt) return 'already-alerted';
  await notify({
    title: 'Alerts paused',
    body: `No pairing check since ${hhmm(health.lastRunAt, timeZone)}. Check the cron-job.org job for /api/poll.`,
    tag: 'poller-health',
    url: '/settings',
  });
  await raw.set(KEY, { ...health, alertedAt: now });
  return 'alerted';
}

/** A notifier that pushes to one store's devices (the owner's). */
export function pushTo(store, { vapid, sender } = {}) {
  return async (payload) => {
    const result = await sendPush(await store.listSubscriptions(), [payload], { vapid, sender });
    for (const endpoint of result.expired) await store.removeSubscription(endpoint);
    return result;
  };
}
