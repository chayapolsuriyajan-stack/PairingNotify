import { unauthorized, userStore } from '@/server/auth';

/** Register this device for push (one subscription per device). */
export async function POST(request: Request) {
  const store = await userStore();
  if (!store) return unauthorized();
  const sub = await request.json().catch(() => null);
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth || !/^https:\/\//.test(sub.endpoint)) {
    return Response.json({ error: 'Not a push subscription' }, { status: 400 });
  }
  await store.saveSubscription({
    endpoint: sub.endpoint,
    keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
  });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const store = await userStore();
  if (!store) return unauthorized();
  const { endpoint } = await request.json().catch(() => ({}));
  if (endpoint) await store.removeSubscription(endpoint);
  return Response.json({ ok: true });
}
