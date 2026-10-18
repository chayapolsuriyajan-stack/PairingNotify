import { unauthorized, userStore } from '@/server/auth';
import { mergeSettings, readSettings } from '@/lib/settings.js';

/** This account's alert settings (lib/settings.js). */
export async function GET() {
  const store = await userStore();
  if (!store) return unauthorized();
  return Response.json(await readSettings(store), { headers: { 'Cache-Control': 'no-store' } });
}

/** Merge a partial update; invalid fields are dropped, not rejected. */
export async function POST(request: Request) {
  const store = await userStore();
  if (!store) return unauthorized();
  const patch = await request.json().catch(() => ({}));
  const next = mergeSettings(await readSettings(store), patch);
  await store.set('settings', next);
  return Response.json(next);
}
