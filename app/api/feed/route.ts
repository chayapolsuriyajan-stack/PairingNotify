import { unauthorized, userStore } from '@/server/auth';

/** The poller's latest view of everyone you follow, plus the follow list itself. */
export async function GET() {
  const store = await userStore();
  if (!store) return unauthorized();
  const [feed, follows] = await Promise.all([store.get('feed'), store.listFollows()]);
  return Response.json(
    { feed: feed ?? { generatedAt: null, follows: [], errors: [] }, follows },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
