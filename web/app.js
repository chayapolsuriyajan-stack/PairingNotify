/**
 * PairingNotify PWA.
 *
 * Reads the JSON feed the GitHub Actions poller commits, renders it, and drives the
 * one-time push-subscription flow.
 */

// Public half of the VAPID keypair. Safe to commit — it is sent to the push service
// by every subscriber. Generate with: npx web-push generate-vapid-keys
// Replace this placeholder with your own public key (see README step 3).
const VAPID_PUBLIC_KEY = '';

const FEED_URL = './data/pairings.json';

const el = (id) => document.getElementById(id);

/* ---------------------------------------------------------------- rendering */

function colourLabel(colour) {
  if (!colour) return '';
  return `<span class="colour colour--${colour}">${colour === 'white' ? 'White' : 'Black'}</span>`;
}

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (char) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]),
  );
}

function renderPairing(pairing, isCurrent) {
  const board = pairing.board != null ? `<span class="pairing__board">Board ${pairing.board}</span>` : '';
  const rating = pairing.rating ? ` <span class="pairing__rating">${pairing.rating}</span>` : '';
  return `
    <div class="pairing ${isCurrent ? 'pairing--current' : ''}">
      <div class="pairing__meta">
        <span>Round ${pairing.round}</span>
        ${board}
      </div>
      <p class="pairing__opponent">${escapeHtml(pairing.opponent ?? 'Not paired yet')}${rating}</p>
      ${colourLabel(pairing.colour)}
    </div>`;
}

function renderHistory(rounds, currentRound) {
  const past = rounds.filter((round) => round.paired && round.round !== currentRound);
  if (past.length === 0) return '';
  const items = past
    .reverse()
    .map(
      (round) => `
      <li>
        <span class="rd">R${round.round}</span>
        <span class="who">${escapeHtml(round.opponent)}${round.rating ? ` (${round.rating})` : ''}</span>
        <span class="res">${escapeHtml(round.result ?? '')}</span>
      </li>`,
    )
    .join('');
  return `<ul class="history">${items}</ul>`;
}

function renderFeed(feed) {
  el('status').textContent = feed.player ? `Watching ${feed.player}` : '';
  el('generated').textContent = feed.generatedAt
    ? `Updated ${new Date(feed.generatedAt).toLocaleString()}`
    : '';

  if (feed.searchDegraded) {
    el('degraded').hidden = false;
    el('degraded-detail').textContent = feed.discoveryError ? ` (${feed.discoveryError})` : '';
  }

  const container = el('tournaments');
  if (!feed.tournaments?.length) {
    container.innerHTML =
      '<p class="empty">No tournaments yet.<br>Add one to <code>watchlist.json</code>, or wait for the next poll.</p>';
    return;
  }

  container.innerHTML = feed.tournaments
    .map((tournament) => {
      const current = tournament.latestPaired;
      const body = current
        ? renderPairing(current, true) + renderHistory(tournament.rounds ?? [], current.round)
        : '<p class="empty">No pairing published yet.</p>';
      return `
        <div class="tournament">
          <h2><a href="${escapeHtml(tournament.url)}" target="_blank" rel="noopener">${escapeHtml(tournament.title)}</a></h2>
          ${body}
        </div>`;
    })
    .join('');
}

async function loadFeed() {
  try {
    const response = await fetch(`${FEED_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    renderFeed(await response.json());
  } catch (error) {
    el('status').textContent = `Could not load pairings (${error.message}). Showing cached data if available.`;
  }
}

/* ------------------------------------------------------------ notifications */

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isIOS() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function urlBase64ToUint8Array(base64) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

function setNotifyStatus(text) {
  el('notify-status').textContent = text;
}

async function showSubscription(subscription) {
  el('subscription-box').hidden = false;
  el('subscription').value = JSON.stringify(subscription.toJSON());
  setNotifyStatus('Notifications are on for this device.');
  el('enable').hidden = true;
}

async function setUpNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    setNotifyStatus('This browser does not support web push.');
    return;
  }

  const registration = await navigator.serviceWorker.register('sw.js');

  // iOS only delivers push to a web app launched from the Home Screen. Saying so up
  // front is the difference between "not supported yet" and "app looks broken".
  if (isIOS() && !isStandalone()) {
    setNotifyStatus(
      'On iPhone, tap the Share button, choose "Add to Home Screen", then open Pairings ' +
        'from your Home Screen. Push notifications only work from there.',
    );
    return;
  }

  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    await showSubscription(existing);
    return;
  }

  if (!VAPID_PUBLIC_KEY) {
    setNotifyStatus('Set VAPID_PUBLIC_KEY in web/app.js first (README step 3).');
    return;
  }

  setNotifyStatus('Notifications are off for this device.');
  el('enable').hidden = false;

  el('enable').addEventListener('click', async () => {
    try {
      // Must happen inside the tap handler: iOS rejects permission prompts otherwise.
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setNotifyStatus(`Permission ${permission}. Allow notifications in Settings to continue.`);
        return;
      }
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      await showSubscription(subscription);
    } catch (error) {
      setNotifyStatus(`Could not subscribe: ${error.message}`);
    }
  });
}

el('copy')?.addEventListener('click', async () => {
  const text = el('subscription').value;
  try {
    await navigator.clipboard.writeText(text);
    el('copy').textContent = 'Copied';
  } catch {
    el('subscription').select(); // clipboard API is blocked in some iOS contexts
    el('copy').textContent = 'Select and copy manually';
  }
});

el('refresh').addEventListener('click', loadFeed);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) loadFeed();
});

loadFeed();
setUpNotifications().catch((error) => setNotifyStatus(`Notification setup failed: ${error.message}`));
