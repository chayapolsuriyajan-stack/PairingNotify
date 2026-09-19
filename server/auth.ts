import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

/**
 * No accounts: one passcode (APP_PASSCODE) guards your follows, devices and settings.
 * Entering it once sets an httpOnly cookie holding an HMAC of the passcode, so the
 * passcode itself is never stored in the browser. Browsing tournaments stays public.
 */

export const SESSION_COOKIE = 'pn_session';

export function passcodeRequired(): boolean {
  return Boolean(process.env.APP_PASSCODE);
}

function token(passcode: string): string {
  return createHmac('sha256', passcode).update('pairingnotify-session-v1').digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function sessionToken(): string {
  return token(process.env.APP_PASSCODE ?? '');
}

export function passcodeMatches(input: unknown): boolean {
  if (!passcodeRequired()) return true;
  return safeEqual(token(String(input ?? '')), sessionToken());
}

export async function isAuthed(): Promise<boolean> {
  if (!passcodeRequired()) return true;
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  return Boolean(value) && safeEqual(value!, sessionToken());
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
