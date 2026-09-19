import { isAuthed, unauthorized } from '@/server/auth';
import { getStore } from '@/lib/store/index.js';
import { sendPush, vapidFromEnv } from '@/lib/notify.js';

/** Send a sample alert to every registered device. */
export async function POST() {
  if (!(await isAuthed())) return unauthorized();
  const vapid = vapidFromEnv();
  if (!vapid) return Response.json({ error: 'VAPID keys are not configured on the server.' }, { status: 503 });

  const store = getStore();
  const subs = await store.listSubscriptions();
  const result = await sendPush(
    subs,
    [{ title: 'RD 5 · BD 12', body: 'vs Test, Opponent (2150) · WHITE — test alert', tag: 'test', url: '/' }],
    { vapid },
  );
  for (const endpoint of result.expired) await store.removeSubscription(endpoint);
  return Response.json({ devices: subs.length, ...result });
}
