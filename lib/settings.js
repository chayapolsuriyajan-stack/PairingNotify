/**
 * Per-account alert settings, kept as the `settings` value in that account's store.
 * Everything is validated here, so the poller can trust what it reads.
 */

export const STYLES = ['lines', 'quotes', 'custom'];
export const REMINDER_MINUTES = [15, 30, 60];
const OUTCOMES = ['win', 'draw', 'loss'];

export const DEFAULT_SETTINGS = Object.freeze({
  results: {
    win: true,
    draw: true,
    loss: true,
    /** Also for the players you follow, not just you. */
    followed: true,
    style: 'lines',
    custom: { win: '', draw: '', loss: '' },
  },
  reminder: { on: true, minutes: 30, followed: false },
  /** IANA zone the schedule's local times are read in; sent by the browser. */
  timeZone: null,
});

function validZone(zone) {
  if (typeof zone !== 'string' || !zone || zone.length > 64) return null;
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return zone;
  } catch {
    return null;
  }
}

const bool = (value, fallback) => (typeof value === 'boolean' ? value : fallback);
const text = (value) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);

/**
 * Merge `patch` onto `current`, dropping anything invalid.
 * @param {any} [current]
 * @param {any} [patch]
 */
export function mergeSettings(current = DEFAULT_SETTINGS, patch = {}) {
  const base = normaliseSettings(current);
  const results = patch.results ?? {};
  const reminder = patch.reminder ?? {};
  return normaliseSettings({
    results: {
      ...base.results,
      ...results,
      custom: { ...base.results.custom, ...(results.custom ?? {}) },
    },
    reminder: { ...base.reminder, ...reminder },
    timeZone: 'timeZone' in patch ? patch.timeZone : base.timeZone,
  });
}

export function normaliseSettings(input) {
  const d = DEFAULT_SETTINGS;
  const r = input?.results ?? {};
  const m = input?.reminder ?? {};
  return {
    results: {
      ...Object.fromEntries(OUTCOMES.map((o) => [o, bool(r[o], d.results[o])])),
      followed: bool(r.followed, d.results.followed),
      style: STYLES.includes(r.style) ? r.style : d.results.style,
      custom: Object.fromEntries(OUTCOMES.map((o) => [o, text(r.custom?.[o])])),
    },
    reminder: {
      on: bool(m.on, d.reminder.on),
      minutes: REMINDER_MINUTES.includes(m.minutes) ? m.minutes : d.reminder.minutes,
      followed: bool(m.followed, d.reminder.followed),
    },
    timeZone: validZone(input?.timeZone),
  };
}

export async function readSettings(store) {
  return normaliseSettings((await store.get('settings')) ?? DEFAULT_SETTINGS);
}
