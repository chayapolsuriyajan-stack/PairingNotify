import { cookies } from 'next/headers';
import { SESSION_COOKIE, passcodeMatches, passcodeRequired, sessionToken } from '@/server/auth';

/** Enter the passcode once per device. */
export async function POST(request: Request) {
  const { passcode } = await request.json().catch(() => ({}));
  if (!passcodeMatches(passcode)) {
    await new Promise((resolve) => setTimeout(resolve, 800)); // slow down guessing
    return Response.json({ error: 'Wrong passcode' }, { status: 401 });
  }
  if (passcodeRequired()) {
    (await cookies()).set(SESSION_COOKIE, sessionToken(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return Response.json({ ok: true });
}

export async function DELETE() {
  (await cookies()).delete(SESSION_COOKIE);
  return Response.json({ ok: true });
}
