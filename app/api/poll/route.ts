import { cronAuthorized } from '@/server/auth';
import { pollOnce } from '@/server/poll';

/**
 * Called by cron-job.org every 1–2 minutes with `Authorization: Bearer <CRON_SECRET>`.
 * `?dryRun=1` parses and diffs without pushing or saving (same as the old --dry-run).
 */
export const maxDuration = 60;

async function handle(request: Request) {
  if (!cronAuthorized(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const dryRun = new URL(request.url).searchParams.get('dryRun') === '1';
  try {
    const result = await pollOnce({ dryRun });
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
