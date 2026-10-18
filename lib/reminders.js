/**
 * "30 MIN · RD 6 · 15:00": a heads-up before a scheduled round.
 *
 * chess-results publishes round times as local wall-clock times with no time zone. The
 * player is at the venue, so the account's own time zone (sent by their browser, see
 * lib/settings.js) is the right one to read them in; the app's countdown does the same
 * with the device clock.
 */

import { fullName } from './notify.js';

/** Offset of `zone` from UTC at instant `ms`, in ms. */
function zoneOffset(ms, zone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** "2026-09-19" + "15:35" in `zone` -> ms since epoch; null when either is missing. */
export function zonedTime(date, time, zone = 'UTC') {
  const d = String(date ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const t = String(time ?? '').match(/^(\d{1,2}):(\d{2})/);
  if (!d || !t) return null;
  const wall = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]);
  // Two passes settle the offset across a DST change.
  let at = wall - zoneOffset(wall, zone);
  at = wall - zoneOffset(at, zone);
  return at;
}

/** The schedule with each round's start as an instant. */
export function timedSchedule(schedule, zone) {
  return (schedule ?? []).map((s) => ({ ...s, at: zonedTime(s.date, s.time, zone ?? 'UTC') }));
}

/**
 * Which reminders to send now.
 *
 * @param {object} args
 * @param {Array<{follow, tournamentId, title, startNo, playerName, rounds, schedule}>} args.items
 *        schedule entries carry `at` (see timedSchedule)
 * @param {object} args.settings  normalised settings
 * @param {Record<string, number>} args.sent  reminder key -> when it was sent
 * @param {number} args.now
 * @returns {Array<{key: string, payload: object}>}
 */
export function dueReminders({ items, settings, sent, now }) {
  const { on, minutes, followed } = settings.reminder;
  if (!on || !settings.timeZone) return [];
  const window = minutes * 60_000;
  const due = [];

  for (const item of items) {
    if (!item.follow.isMe && !followed) continue;
    for (const slot of item.schedule ?? []) {
      if (!slot.at || slot.at <= now || slot.at - now > window) continue;
      const key = `${item.tournamentId}:${item.startNo}:${slot.round}`;
      if (sent[key]) continue;
      const game = item.rounds?.find((r) => r.round === slot.round);
      if (game?.result) continue; // already played (an early or rescheduled round)

      const left = Math.max(1, Math.round((slot.at - now) / 60_000));
      const who = item.follow.isMe ? '' : `${fullName(item.playerName ?? item.follow.playerName)} · `;
      const body = !game
        ? 'Pairings not out yet'
        : !game.paired
          ? 'Not paired this round (bye)'
          : [
              game.board != null ? `BD ${game.board}` : null,
              `vs ${fullName(game.opponent)}${game.rating ? ` (${game.rating})` : ''}`,
              game.colour ? game.colour.toUpperCase() : null,
            ]
              .filter(Boolean)
              .join(' · ');
      due.push({
        key,
        payload: {
          title: `${who}${left} MIN · RD ${slot.round}${slot.time ? ` · ${slot.time}` : ''}`,
          body,
          tag: `${item.tournamentId}-${item.startNo}-r${slot.round}-reminder`,
          url: `/t/${item.tournamentId}?p=${item.startNo}`,
          tournament: item.title ?? null,
          round: slot.round,
        },
      });
    }
  }
  return due;
}
