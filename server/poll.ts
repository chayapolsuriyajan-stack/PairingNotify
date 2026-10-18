import { runPollForAll } from '@/lib/poll.js';
import { listUsers } from '@/lib/accounts.js';
import { getRawStore, getStore, OWNER } from '@/lib/store/index.js';

/**
 * Run one poll unless another is already running (cron tick vs. a refresh after
 * adding a follow). Two concurrent polls could both see a new round and push it twice.
 * Covers every account: the owner and everyone they invited.
 */
export async function pollOnce(options: { dryRun?: boolean } = {}) {
  const owner = getStore();
  if (!(await owner.lock('poll', 55_000))) return { skipped: 'another poll is running' };
  try {
    const users: { id: string }[] = await listUsers(getRawStore());
    const stores = [OWNER, ...users.map((u) => u.id)].map((id) => getStore(id));
    return await runPollForAll({ stores, dryRun: Boolean(options.dryRun) });
  } finally {
    await owner.unlock('poll');
  }
}
