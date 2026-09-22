/* PairingNotify service worker.
 *
 * - Shows pushed pairings on the lock screen and opens the right page when tapped.
 * - Keeps the app usable in a playing hall with bad Wi-Fi: API data is network-first
 *   with the last good copy as fallback, static assets are cache-first, and pages fall
 *   back to the last copy seen.
 */

const VERSION = 'pn-v3';
const STATIC = `${VERSION}-static`;
const DATA = `${VERSION}-data`;
const PAGES = `${VERSION}-pages`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(PAGES).then((cache) => cache.addAll(['/', '/manifest.webmanifest'])),
      // The lock-screen icon and badge must be there even when the push arrives with
      // no network — a notification with a missing icon shows a blank placeholder.
      caches.open(STATIC).then((cache) => cache.addAll(['/icons/icon-192.png', '/icons/badge-96.png'])),
    ])
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) {
      // Tell the page this is an offline copy.
      const headers = new Headers(cached.headers);
      headers.set('X-From-Cache', '1');
      return new Response(await cached.blob(), { status: cached.status, headers });
    }
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/poll') || url.pathname.startsWith('/api/session')) return;
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, DATA));
    return;
  }
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(
      networkFirst(request, PAGES).catch(async () => (await caches.match('/')) ?? Response.error()),
    );
  }
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'New pairing', body: event.data ? event.data.text() : '' };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'New pairing', {
      body: payload.tournament ? `${payload.body}\n${payload.tournament}` : payload.body || '',
      // A stable tag means a re-sent alert for the same round replaces the old one
      // instead of stacking a duplicate on the lock screen.
      tag: payload.tag || 'pairing',
      renotify: true,
      icon: '/icons/icon-192.png',
      // The badge is the tiny status-bar mark. Android throws away its colours and
      // keeps only the alpha channel, so it must be a transparent monochrome shape —
      // passing the app icon here (every pixel opaque) drew a blank white square.
      // See scripts/make-badge.mjs.
      badge: '/icons/badge-96.png',
      data: { url: payload.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      // Reuse the open app, but take it to the pairing that was tapped.
      const existing = clients.find((client) => client.url.startsWith(self.location.origin));
      if (existing) {
        await existing.navigate(target).catch(() => {});
        return existing.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
