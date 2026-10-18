import { currentUser, passcodeRequired } from '@/server/auth';
import { getStore, OWNER } from '@/lib/store/index.js';

/**
 * What the app needs to know at runtime. The VAPID public key is served from here
 * rather than baked into the bundle, so setting it on Vercel needs no rebuild.
 */
export async function GET() {
  const user = await currentUser();
  return Response.json(
    {
      vapidPublicKey: process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null,
      passcodeRequired: passcodeRequired(),
      authed: user != null,
      role: user == null ? null : user === OWNER ? 'owner' : 'user',
      storage: getStore().kind,
      cronConfigured: Boolean(process.env.CRON_SECRET),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
