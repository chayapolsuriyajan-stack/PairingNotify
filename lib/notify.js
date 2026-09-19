/**
 * Web Push for new pairings.
 *
 * Subscriptions (one per device) live in the store. A subscription is a bearer-style
 * credential — anyone holding it can push to that device — so it never leaves the
 * server. The VAPID private key comes from the environment.
 */

import webpush from 'web-push';

/** "Kantor, Sam" -> "Kantor". Used to prefix alerts about players you follow. */
export function shortName(name) {
  return String(name ?? '').split(',')[0].trim() || String(name ?? '');
}

/** Opponent line: "vs Novák, Šimon (2145) · WHITE · CZE". */
export function describePairing(pairing) {
  const parts = [];
  const opponent = pairing.opponent ? pairing.opponent.replace(/,\s*$/, '') : null;
  parts.push(opponent ? `vs ${opponent}` : 'Pairing published');
  if (pairing.rating) parts[0] += ` (${pairing.rating})`;
  if (pairing.colour) parts.push(pairing.colour.toUpperCase());
  if (pairing.federation) parts.push(pairing.federation);
  return parts.join(' · ');
}

/**
 * Lock-screen copy (design.md §8): short, scannable, board first.
 *   title: "RD 5 · BD 12"            (you)
 *          "Kantor · RD 5 · BD 12"   (someone you follow)
 *   body:  "vs Novák, Šimon (2145) · WHITE · CZE"
 */
export function buildNotification(pairing) {
  const where = [`RD ${pairing.round}`];
  if (pairing.board != null) where.push(`BD ${pairing.board}`);
  const who = pairing.isMe === false && pairing.playerName ? `${shortName(pairing.playerName)} · ` : '';
  const url =
    pairing.startNo != null
      ? `/t/${pairing.tournamentId}?p=${pairing.startNo}`
      : `/t/${pairing.tournamentId}`;

  return {
    title: `${who}${where.join(' · ')}`,
    body: describePairing(pairing),
    tag: `${pairing.tournamentId}-${pairing.startNo ?? ''}-r${pairing.round}`,
    url,
    tournament: pairing.tournamentTitle ?? null,
    round: pairing.round,
    board: pairing.board ?? null,
    opponent: pairing.opponent ?? null,
    rating: pairing.rating ?? null,
    colour: pairing.colour ?? null,
  };
}

/** VAPID settings from the environment, or null when push isn't configured. */
export function vapidFromEnv(env = process.env) {
  const publicKey = env.VAPID_PUBLIC_KEY || env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  return { subject: env.VAPID_SUBJECT || 'mailto:pairingnotify@example.com', publicKey, privateKey };
}

/**
 * Send every payload to every subscription.
 *
 * @param {Array<{endpoint:string, keys:object}>} subscriptions
 * @param {object[]} payloads      notification objects (see buildNotification)
 * @param {object} options
 * @param {{subject,publicKey,privateKey}|null} options.vapid
 * @param {(sub, body, opts) => Promise} [options.sender]  injectable for tests
 * @returns {Promise<{sent:number, failed:number, expired:string[]}>} expired = endpoints to forget
 */
export async function sendPush(subscriptions, payloads, { vapid, sender } = {}) {
  const result = { sent: 0, failed: 0, expired: [] };
  if (payloads.length === 0 || subscriptions.length === 0) return result;
  if (!vapid && !sender) {
    console.warn('! VAPID keys are not configured — skipping push.');
    return result;
  }

  const send =
    sender ??
    ((sub, body, opts) =>
      webpush.sendNotification(sub, body, {
        ...opts,
        vapidDetails: { subject: vapid.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
      }));

  for (const sub of subscriptions) {
    for (const payload of payloads) {
      try {
        await send(sub, JSON.stringify(payload), { TTL: 6 * 60 * 60, urgency: 'high' });
        result.sent++;
      } catch (error) {
        result.failed++;
        if (error.statusCode === 404 || error.statusCode === 410) {
          // The device unsubscribed or the app was reinstalled: forget it.
          result.expired.push(sub.endpoint);
          break;
        }
        console.error(`! Push failed (${error.statusCode ?? 'no status'}): ${error.message}`);
      }
    }
  }
  return result;
}
