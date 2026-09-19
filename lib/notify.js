/**
 * Send new pairings to the phone as Web Push notifications.
 *
 * The VAPID private key and the push subscription both come from GitHub Actions
 * secrets. The subscription is a bearer-style credential — anyone holding it can push
 * to your device — which is exactly why it is a secret and not a file in the repo.
 */

import webpush from 'web-push';

/** Human-readable one-liner for a pairing, used as the notification body. */
export function describePairing(pairing) {
  const parts = [];
  parts.push(pairing.opponent ? `vs ${pairing.opponent}` : 'Pairing published');
  if (pairing.rating) parts[0] += ` (${pairing.rating})`;
  if (pairing.colour) parts.push(pairing.colour === 'white' ? 'White' : 'Black');
  if (pairing.federation) parts.push(pairing.federation);
  return parts.join(' · ');
}

export function buildNotification(pairing) {
  const board = pairing.board != null ? ` — Board ${pairing.board}` : '';
  return {
    title: `Round ${pairing.round}${board}`,
    body: describePairing(pairing),
    tag: `${pairing.tournamentId}-r${pairing.round}`,
    url: pairing.url,
    tournament: pairing.tournamentTitle,
    round: pairing.round,
    board: pairing.board,
    opponent: pairing.opponent,
    rating: pairing.rating,
    colour: pairing.colour,
  };
}

/**
 * @returns {Promise<{sent:number, failed:number, subscriptionExpired:boolean}>}
 */
export async function sendPairingNotifications(pairings, env = process.env) {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, PUSH_SUBSCRIPTION } = env;

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn('! VAPID keys are not configured — skipping push. See README step 3.');
    return { sent: 0, failed: 0, subscriptionExpired: false };
  }
  if (!PUSH_SUBSCRIPTION) {
    console.warn(
      '! PUSH_SUBSCRIPTION secret is not set — skipping push. ' +
        'Open the app on your phone, tap "Enable notifications", and paste the JSON it shows.',
    );
    return { sent: 0, failed: 0, subscriptionExpired: false };
  }

  let subscription;
  try {
    subscription = JSON.parse(PUSH_SUBSCRIPTION);
  } catch (error) {
    throw new Error(`PUSH_SUBSCRIPTION is not valid JSON: ${error.message}`);
  }
  if (!subscription?.endpoint) {
    throw new Error('PUSH_SUBSCRIPTION has no "endpoint" — re-copy it from the app.');
  }

  webpush.setVapidDetails(
    VAPID_SUBJECT || 'mailto:pairingnotify@example.com',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
  );

  let sent = 0;
  let failed = 0;
  let subscriptionExpired = false;

  for (const pairing of pairings) {
    const payload = JSON.stringify(buildNotification(pairing));
    try {
      await webpush.sendNotification(subscription, payload, { TTL: 6 * 60 * 60 });
      sent++;
      console.log(`  pushed: Round ${pairing.round} vs ${pairing.opponent ?? '?'}`);
    } catch (error) {
      failed++;
      if (error.statusCode === 404 || error.statusCode === 410) {
        subscriptionExpired = true;
        console.error(
          `! Push subscription is dead (HTTP ${error.statusCode}). Open the app on your ` +
            'phone, tap "Enable notifications" again, and update the PUSH_SUBSCRIPTION secret.',
        );
        break; // Every remaining send would fail identically.
      }
      console.error(`! Push failed (${error.statusCode ?? 'no status'}): ${error.message}`);
    }
  }

  return { sent, failed, subscriptionExpired };
}
