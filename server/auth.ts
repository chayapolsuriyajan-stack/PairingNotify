import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { OWNER } from '@/lib/store/scoped.js';
import { userExists } from '@/lib/accounts.js';
import { getRawStore, getStore } from '@/lib/store/index.js';

/**
 * No passwords beyond the owner's: APP_PASSCODE makes you the owner, and an invite code
 * (lib/accounts.js) makes you one of the people the owner invited. Either way the device
 * gets an httpOnly cookie `<userId>.<signature>`, so neither secret is kept in the
 * browser. Browsing tournaments stays public.
 */

export const SESSION_COOKIE = 'pn_session';

export function passcodeRequired(): boolean {
  return Boolean(process.env.APP_PASSCODE);
}

function hmac(key: string, message: string): string {
  return createHmac('sha256', key).update(message).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** The cookie the owner had before accounts existed; still accepted. */
function legacyOwnerToken(): string {
  return hmac(process.env.APP_PASSCODE ?? '', 'pairingnotify-session-v1');
}

function signingKey(): string {
  return process.env.SESSION_SECRET || process.env.APP_PASSCODE || 'pairingnotify-dev';
}

export function sessionToken(userId: string = OWNER): string {
  return `${userId}.${hmac(signingKey(), `pairingnotify-user-v1:${userId}`)}`;
}

export function passcodeMatches(input: unknown): boolean {
  if (!passcodeRequired()) return true;
  return safeEqual(hmac(String(input ?? ''), 'pairingnotify-session-v1'), legacyOwnerToken());
}

/** Who this request is, or null when the device hasn't signed in. */
export async function currentUser(): Promise<string | null> {
  const value = (await cookies()).get(SESSION_COOKIE)?.value ?? '';
  const dot = value.lastIndexOf('.');
  if (dot > 0) {
    const userId = value.slice(0, dot);
    if (safeEqual(value, sessionToken(userId))) {
      if (userId === OWNER) return OWNER;
      // A removed account's cookie stops working at once.
      return (await userExists(getRawStore(), userId)) ? userId : null;
    }
  }
  if (passcodeRequired() && value && safeEqual(value, legacyOwnerToken())) return OWNER;
  // No passcode set (local development): everyone is the owner.
  return passcodeRequired() ? null : OWNER;
}

export async function isAuthed(): Promise<boolean> {
  return (await currentUser()) != null;
}

/** The signed-in user's store, or null. */
export async function userStore() {
  const user = await currentUser();
  return user ? getStore(user) : null;
}

/** cron-job.org sends `Authorization: Bearer <CRON_SECRET>`. Open only in local dev. */
export function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  return safeEqual(request.headers.get('authorization') ?? '', `Bearer ${secret}`);
}

export function unauthorized() {
  return Response.json({ error: 'Passcode required' }, { status: 401 });
}
