import { isAuthed, unauthorized } from '@/server/auth';
import { getStore } from '@/lib/store/index.js';

/** The poller's latest view of everyone you follow, plus the follow list itself. */
export async function GET() {
  if (!(await isAuthed())) return unauthorized();
  const store = getStore();
  const [feed, follows] = await Promise.all([store.get('feed'), store.listFollows()]);
  return Response.json(
    { feed: feed ?? { generatedAt: null, follows: [], errors: [] }, follows },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
