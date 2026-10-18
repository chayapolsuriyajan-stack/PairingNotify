import { cookies } from 'next/headers';
import { SESSION_COOKIE, passcodeMatches, passcodeRequired, sessionToken } from '@/server/auth';
import { normaliseCode, redeemCode } from '@/lib/accounts.js';
import { getRawStore, OWNER } from '@/lib/store/index.js';

/**
 * Sign this device in, once: with the owner's passcode, or with an invite / sign-in
 * code (lib/accounts.js). `{code}` and the older `{passcode}` body are both accepted.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const input = String(body.code ?? body.passcode ?? '');

  // A code-shaped input is tried as an invite first: with no passcode set (local
  // development) passcodeMatches() accepts anything and would hide invites.
  let userId: string | null = null;
  if (normaliseCode(input)) userId = (await redeemCode(getRawStore(), input))?.userId ?? null;
  if (!userId && passcodeRequired() && passcodeMatches(input)) userId = OWNER;
  if (!userId && !passcodeRequired() && !normaliseCode(input)) userId = OWNER;

  if (!userId) {
    await new Promise((resolve) => setTimeout(resolve, 800)); // slow down guessing
    return Response.json({ error: 'Wrong passcode or code' }, { status: 401 });
  }

  (await cookies()).set(SESSION_COOKIE, sessionToken(userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  return Response.json({ ok: true, role: userId === OWNER ? 'owner' : 'user' });
}

export async function DELETE() {
  (await cookies()).delete(SESSION_COOKIE);
  return Response.json({ ok: true });
}
