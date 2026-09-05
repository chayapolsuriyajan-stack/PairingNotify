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

// Repo + branch the "Fast watching" button dispatches watch.yml against. Update REF
// once you merge onto your default branch — workflow_dispatch runs the version of
// the workflow file that lives on this ref.
const REPO_OWNER = 'chayapolsuriyajan-stack';
const REPO_NAME = 'PairingNotify';
const REPO_REF = 'claude/chess-pairing-notifications-atzfns';

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
  if (!document.hidden) {
    loadFeed();
    refreshWatchStatusQuietly();
  }
});

/* ------------------------------------------------------------- fast watching */
/*
 * Starting/cancelling the watch.yml workflow needs a GitHub API call with write
 * access to Actions on this repo — something a static page cannot hold securely.
 * The tradeoff made here, deliberately, for a personal single-user tool: the token
 * lives only in this device's localStorage, is scoped (by the fine-grained PAT you
 * create) to Actions-only on this one repository, and is sent only to
 * api.github.com. It is never committed, never sent anywhere else, and never seen
 * by anyone but you and GitHub.
 */

const PAT_STORAGE_KEY = 'pairingnotify.githubPat';
const API_BASE = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;

function getStoredPat() {
  try {
    return localStorage.getItem(PAT_STORAGE_KEY) || '';
  } catch {
    return ''; // private browsing / storage blocked
  }
}

function setStoredPat(token) {
  try {
    localStorage.setItem(PAT_STORAGE_KEY, token);
  } catch {
    // Can't persist it — the caller will just have to paste it again next time.
  }
}

function setWatchStatus(text) {
  el('watch-status').textContent = text;
}

async function githubApi(path, options = {}) {
  const token = getStoredPat();
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
  } catch (networkError) {
    // A thrown TypeError here (as opposed to an HTTP error status below) usually
    // means the browser blocked the request before it got a response — most likely
    // a CORS rejection from api.github.com, not a real connectivity problem.
    throw new Error(
      `Could not reach GitHub (${networkError.message}). If this persists, your browser may be ` +
        'blocking the request as cross-origin; use the Actions tab on GitHub directly instead.',
    );
  }
  if (response.status === 401 || response.status === 403) {
    setStoredPat('');
    throw new Error('Token rejected — it may be expired or missing "Actions: Read and write". Paste a fresh one.');
  }
  if (!response.ok && response.status !== 204) {
    const body = await response.text().catch(() => '');
    throw new Error(`GitHub API ${response.status}: ${body.slice(0, 200)}`);
  }
  return response.status === 204 ? null : response.json();
}

/** The one currently running (or queued) watch.yml run, if any. */
async function findActiveWatchRun() {
  const data = await githubApi('/actions/workflows/watch.yml/runs?per_page=10');
  return (data?.workflow_runs ?? []).find((run) => run.status === 'in_progress' || run.status === 'queued') ?? null;
}

/** Throws on failure — callers that don't specifically need to react differently
 *  to that (vs. a start/stop action's own failure) should use refreshWatchStatusQuietly. */
async function refreshWatchStatus() {
  if (!getStoredPat()) return; // nothing to check yet; setUpWatchPanel already prompted
  const active = await findActiveWatchRun();
  renderWatchButton(active);
}

function refreshWatchStatusQuietly() {
  refreshWatchStatus().catch((error) => setWatchStatus(error.message));
}

function renderWatchButton(activeRun) {
  const button = el('watch-toggle');
  button.hidden = false;
  if (activeRun) {
    setWatchStatus(`Watching fast — started ${new Date(activeRun.created_at).toLocaleTimeString()}.`);
    button.textContent = 'Stop watching';
    button.dataset.action = 'stop';
    button.dataset.runId = activeRun.id;
  } else {
    setWatchStatus('Not watching fast right now — back to the normal ~10-25 minute schedule.');
    button.textContent = 'Start watching';
    button.dataset.action = 'start';
    delete button.dataset.runId;
  }
}

async function setUpWatchPanel() {
  el('pat-save').addEventListener('click', async () => {
    const token = el('pat-input').value.trim();
    if (!token) return;
    setStoredPat(token);
    el('pat-input').value = '';
    el('pat-box').hidden = true;
    refreshWatchStatusQuietly();
  });

  el('watch-toggle').addEventListener('click', async () => {
    const button = el('watch-toggle');
    const stopping = button.dataset.action === 'stop';
    button.disabled = true;
    try {
      if (stopping) {
        setWatchStatus('Stopping…');
        await githubApi(`/actions/runs/${button.dataset.runId}/cancel`, { method: 'POST' });
      } else {
        setWatchStatus('Starting…');
        await githubApi('/actions/workflows/watch.yml/dispatches', {
          method: 'POST',
          body: JSON.stringify({ ref: REPO_REF, inputs: { chain: '1', max_chains: '4' } }),
        });
      }
    } catch (error) {
      // The action itself (start/stop) failed — nothing changed, so the button
      // should go back to reflecting that.
      setWatchStatus(error.message);
      button.disabled = false;
      return;
    }

    // The action succeeded. Checking GitHub's registered state right after is a
    // courtesy, not the source of truth — a hiccup here must not read as "did that
    // even work?" when it did.
    try {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await refreshWatchStatus();
    } catch {
      setWatchStatus(
        `${stopping ? 'Stop' : 'Start'} request sent. Could not confirm the new status yet — tap refresh in a moment.`,
      );
    } finally {
      button.disabled = false;
    }
  });

  if (!getStoredPat()) {
    setWatchStatus('Needs a one-time GitHub token to start/stop watching from here.');
    el('pat-box').hidden = false;
    return;
  }
  refreshWatchStatusQuietly();
}

/* --------------------------------------------------------------------- start */
/* Everything above is declarations only; kick things off here, at the true end
   of the module, so no call site can run before the const/function it depends
   on has been evaluated (a top-level const referenced too early throws a
   temporal-dead-zone ReferenceError, not a friendly message). */

loadFeed();
setUpNotifications().catch((error) => setNotifyStatus(`Notification setup failed: ${error.message}`));
setUpWatchPanel().catch((error) => setWatchStatus(`Fast watching unavailable: ${error.message}`));
