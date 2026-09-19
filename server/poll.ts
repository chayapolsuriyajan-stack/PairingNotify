import { runPoll } from '@/lib/poll.js';
import { getStore } from '@/lib/store/index.js';

/**
 * Run one poll unless another is already running (cron tick vs. a refresh after
 * adding a follow). Two concurrent polls could both see a new round and push it twice.
 */
export async function pollOnce(options: { dryRun?: boolean } = {}) {
  const store = getStore();
  if (!(await store.lock('poll', 55_000))) return { skipped: 'another poll is running' };
  try {
    return await runPoll({ store, dryRun: Boolean(options.dryRun) });
  } finally {
    await store.unlock('poll');
  }
}
