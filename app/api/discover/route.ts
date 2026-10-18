import { unauthorized, userStore } from '@/server/auth';
import { pollOnce } from '@/server/poll';

/**
 * "Find my events now": forget when we last searched for these players, then poll.
 *
 * The poller otherwise searches once a day (lib/poll.js#discoveryInterval), which is
 * the right cadence for a background job but too slow for someone who has just entered
 * a tournament and wants to see it appear.
 */
export const maxDuration = 60;

export async function POST(request: Request) {
  const store = await userStore();
  if (!store) return unauthorized();
  const id = new URL(request.url).searchParams.get('id');

  const poll = ((await store.get('poll')) ?? {}) as { discovery?: Record<string, unknown> };
  if (poll.discovery) {
    for (const key of Object.keys(poll.discovery)) {
      if (!id || key === id) delete poll.discovery[key];
    }
    await store.set('poll', poll);
  }

  const result = await pollOnce();
  return Response.json({ ok: true, ...result }, { headers: { 'Cache-Control': 'no-store' } });
}
