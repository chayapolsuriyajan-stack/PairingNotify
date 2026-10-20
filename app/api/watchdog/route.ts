import { cronAuthorized } from '@/server/auth';
import { checkPoller } from '@/server/poll';

/**
 * Daily backstop (vercel.json `crons`): if cron-job.org has stopped calling /api/poll
 * and nobody has opened the app to notice, this still pushes the owner. Vercel sends
 * `Authorization: Bearer <CRON_SECRET>` itself.
 */
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  return Response.json({ poller: await checkPoller() }, { headers: { 'Cache-Control': 'no-store' } });
}
