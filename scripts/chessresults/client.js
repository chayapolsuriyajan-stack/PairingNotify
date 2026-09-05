/**
 * Thin HTTP client for chess-results.com.
 *
 * chess-results is a small, volunteer-run ASP.NET site with no API and no rate-limit
 * documentation. This client is deliberately polite: it identifies itself, serialises
 * every request behind a shared delay, and never retries fast.
 */

const BASE = 'https://chess-results.com';

const USER_AGENT =
  'PairingNotify/1.0 (personal pairing notifier; +https://github.com/chayapolsuriyajan-stack/PairingNotify)';

/** Minimum gap between two requests, milliseconds. */
const THROTTLE_MS = 1200;

let lastRequestAt = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function throttle() {
  const wait = lastRequestAt + THROTTLE_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

/**
 * Fetch a chess-results URL and return the HTML body.
 *
 * @param {string} path  Path relative to the site root, e.g. "tnr123.aspx?lan=1&art=9".
 * @param {object} [options]
 * @param {Record<string,string>} [options.form]  When set, sends a POST with this form body.
 * @param {number} [options.retries=3]
 * @returns {Promise<string>} HTML
 */
export async function fetchHtml(path, { form, retries = 3 } = {}) {
  const url = path.startsWith('http') ? path : `${BASE}/${path.replace(/^\//, '')}`;
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      // 2s, 4s, 8s. chess-results is more likely to be briefly overloaded than
      // permanently down, so backing off generously is the friendly move.
      await sleep(2000 * 2 ** (attempt - 1));
    }
    await throttle();

    try {
      const response = await fetch(url, {
        method: form ? 'POST' : 'GET',
        headers: {
          'User-Agent': USER_AGENT,
          'Accept-Language': 'en-US,en;q=0.9',
          Accept: 'text/html,application/xhtml+xml',
          ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        },
        body: form ? new URLSearchParams(form).toString() : undefined,
        redirect: 'follow',
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
      }

      const html = await response.text();
      if (html.length < 500) {
        throw new Error(`Suspiciously short response (${html.length} bytes) for ${url}`);
      }
      return html;
    } catch (error) {
      lastError = error;
      console.warn(`  fetch attempt ${attempt + 1}/${retries + 1} failed: ${error.message}`);
    }
  }

  throw new Error(`Giving up on ${url}: ${lastError?.message}`);
}

export function tournamentUrl(id, params = {}) {
  const query = new URLSearchParams({ lan: '1', ...params }).toString();
  return `${BASE}/tnr${id}.aspx?${query}`;
}

export { BASE, USER_AGENT };
