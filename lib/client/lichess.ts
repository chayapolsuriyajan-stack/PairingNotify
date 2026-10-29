/**
 * Signing in with Lichess, in the browser only, so the renamer can rename a study's
 * chapters for you (lib/pgn/lichess.js has the pure parts).
 *
 * Lichess supports OAuth with PKCE for public apps: no client secret and no
 * registration, the token goes straight from Lichess to this device and is kept in
 * localStorage. It never reaches this app's server. Scopes: study:read (private
 * studies) and study:write (add and delete chapters).
 */

import { renameChaptersInPlace as renameInPlace, studyExportUrl } from '@/lib/pgn/lichess.js';

const LICHESS = 'https://lichess.org';
const CLIENT_ID = 'pairingnotify';
const SCOPES = 'study:read study:write';
const TOKEN_KEY = 'pn:lichess';
const PENDING_KEY = 'pn:lichess-pending';

export interface LichessAuth {
  token: string;
  username: string;
}

const base64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const redirectUri = () => `${location.origin}/pgn`;

export function getAuth(): LichessAuth | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as LichessAuth) : null;
  } catch {
    return null;
  }
}

export function signOut() {
  const auth = getAuth();
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // nothing stored
  }
  // Revoke it on Lichess too, so a signed-out token is dead everywhere.
  if (auth) fetch(`${LICHESS}/api/token`, { method: 'DELETE', headers: { Authorization: `Bearer ${auth.token}` } }).catch(() => {});
}

/** Go to Lichess to sign in. The page is left, so `snapshot` is kept to restore on return. */
export async function startSignIn(snapshot: unknown) {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const state = base64url(crypto.getRandomValues(new Uint8Array(16)));
  sessionStorage.setItem(PENDING_KEY, JSON.stringify({ verifier, state, snapshot }));
  const url = new URL(`${LICHESS}/oauth`);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(),
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: SCOPES,
    state,
  }).toString();
  location.assign(url.toString());
}

/**
 * Back from Lichess (`?code=…&state=…`, or `?error=…` if you said no): swap the code for
 * a token. Returns what was on screen before leaving, or null when this isn't a return.
 */
export async function finishSignIn(): Promise<{ auth: LichessAuth | null; snapshot: unknown; error: string | null } | null> {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  const error = params.get('error');
  if (!code && !error) return null;
  const pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? 'null');
  sessionStorage.removeItem(PENDING_KEY);
  history.replaceState(null, '', '/pgn');
  if (!pending) return { auth: null, snapshot: null, error: 'Sign-in expired. Try again.' };
  if (error || params.get('state') !== pending.state) {
    return { auth: null, snapshot: pending.snapshot, error: error === 'access_denied' ? null : 'Lichess sign-in failed.' };
  }

  const response = await fetch(`${LICHESS}/api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code!,
      code_verifier: pending.verifier,
      redirect_uri: redirectUri(),
      client_id: CLIENT_ID,
    }),
  }).catch(() => null);
  const token = response?.ok ? (await response.json()).access_token : null;
  if (!token) return { auth: null, snapshot: pending.snapshot, error: 'Lichess sign-in failed.' };

  const me = await fetch(`${LICHESS}/api/account`, { headers: { Authorization: `Bearer ${token}` } })
    .then((r) => r.json())
    .catch(() => ({}));
  const auth = { token, username: me.username ?? '' };
  localStorage.setItem(TOKEN_KEY, JSON.stringify(auth));
  return { auth, snapshot: pending.snapshot, error: null };
}

/** A study's PGN, with the token when signed in (so private studies work too). */
export async function fetchStudy(id: string, auth: LichessAuth | null): Promise<Response> {
  return fetch(studyExportUrl(id), {
    headers: { Accept: 'application/x-chess-pgn', ...(auth ? { Authorization: `Bearer ${auth.token}` } : {}) },
  });
}

async function call(auth: LichessAuth, path: string, init: RequestInit = {}) {
  const response = await fetch(`${LICHESS}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${auth.token}` },
  });
  if (response.status === 401) throw new Error('Your Lichess sign-in has expired. Sign in again.');
  if (response.status === 403) throw new Error("Lichess says you can't edit this study: only its owner and contributors can.");
  if (response.status === 429) throw new Error('Lichess asked us to slow down. Wait a minute and try again.');
  if (!response.ok) throw new Error(`Lichess answered ${response.status}.`);
  return response;
}

/** Rename a study's chapters in place with this sign-in (see lib/pgn/lichess.js). */
export function renameChaptersInPlace(
  auth: LichessAuth,
  renamedPgn: string,
  onProgress: (done: number, total: number) => void,
): Promise<{ studyId: string; replaced: number }> {
  return renameInPlace((path: string, init?: RequestInit) => call(auth, path, init), renamedPgn, onProgress);
}
