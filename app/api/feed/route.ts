import { after } from 'next/server';
import { unauthorized, userStore } from '@/server/auth';
import { checkPoller } from '@/server/poll';
import { readHealth } from '@/lib/health.js';
import { getRawStore } from '@/lib/store/index.js';

/**
 * The poller's latest view of everyone you follow, plus the follow list itself and the
 * poller's heartbeat, so the app can say when alerts have stopped.
 */
export async function GET() {
  const store = await userStore();
  if (!store) return unauthorized();
  const [feed, follows, health] = await Promise.all([store.get('feed'), store.listFollows(), readHealth(getRawStore())]);
  // Opening the app is also when a stalled poller gets noticed (lib/health.js).
  after(() => checkPoller().catch(() => {}));
  return Response.json(
    {
      feed: feed ?? { generatedAt: null, follows: [], errors: [] },
      follows,
      poller: { lastRunAt: health.lastRunAt, lastOkAt: health.lastOkAt, lastError: health.lastError },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
