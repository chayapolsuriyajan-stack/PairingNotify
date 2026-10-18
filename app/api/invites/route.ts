import { currentUser, unauthorized } from '@/server/auth';
import { getRawStore, OWNER } from '@/lib/store/index.js';
import {
  codesFor,
  createInvite,
  formatCode,
  listInvites,
  listUsers,
  removeUser,
  revokeInvite,
  rotateCode,
} from '@/lib/accounts.js';

type Invite = { code: string; name: string | null; createdAt: number; expiresAt: number; userId: string | null };

const show = (i: Invite) => ({ ...i, code: formatCode(i.code) });
const noStore = { headers: { 'Cache-Control': 'no-store' } };

/**
 * The owner sees every invite and account. Anyone else sees only their own sign-in
 * code, for opening the app on another device.
 */
export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  const raw = getRawStore();
  if (user !== OWNER) {
    return Response.json({ role: 'user', codes: (await codesFor(raw, user)).map(show) }, noStore);
  }
  const [invites, users] = await Promise.all([listInvites(raw), listUsers(raw)]);
  return Response.json(
    {
      role: 'owner',
      pending: invites.filter((i: Invite) => !i.userId).map(show),
      users: users.map((u: { id: string; name: string | null; createdAt: number }) => ({
        ...u,
        codes: invites.filter((i: Invite) => i.userId === u.id).map(show),
      })),
    },
    noStore,
  );
}

/** Owner: `{name}` creates an invite. Anyone: `{rotate: true}` replaces their own code. */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const body = await request.json().catch(() => ({}));
  const raw = getRawStore();

  if (body.rotate) {
    if (user === OWNER) return Response.json({ error: 'The owner signs in with the passcode.' }, { status: 400 });
    return Response.json(show(await rotateCode(raw, user)));
  }
  if (user !== OWNER) return Response.json({ error: 'Only the owner can invite people.' }, { status: 403 });
  return Response.json(show(await createInvite(raw, { name: body.name ?? null })));
}

/** Owner: `?code=` revokes an unused invite, `?user=` deletes an account and its data. */
export async function DELETE(request: Request) {
  if ((await currentUser()) !== OWNER) return Response.json({ error: 'Owner only' }, { status: 403 });
  const params = new URL(request.url).searchParams;
  const raw = getRawStore();
  const code = params.get('code')?.replace(/-/g, '');
  const userId = params.get('user');
  if (code) await revokeInvite(raw, code);
  if (userId && userId !== OWNER) await removeUser(raw, userId);
  return Response.json({ ok: true });
}
