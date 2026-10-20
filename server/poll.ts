import { runPollForAll } from '@/lib/poll.js';
import { listUsers } from '@/lib/accounts.js';
import { pushTo, recordRun, watchdog } from '@/lib/health.js';
import { readSettings } from '@/lib/settings.js';
import { getRawStore, getStore, OWNER } from '@/lib/store/index.js';

/**
 * Run one poll unless another is already running (cron tick vs. a refresh after
 * adding a follow). Two concurrent polls could both see a new round and push it twice.
 * Covers every account: the owner and everyone they invited. Each run leaves a
 * heartbeat (lib/health.js) so a stalled poller doesn't go unnoticed.
 */
export async function pollOnce(options: { dryRun?: boolean } = {}) {
  const owner = getStore();
  if (!(await owner.lock('poll', 55_000))) return { skipped: 'another poll is running' };
  const dryRun = Boolean(options.dryRun);
  try {
    const users: { id: string }[] = await listUsers(getRawStore());
    const stores = [OWNER, ...users.map((u) => u.id)].map((id) => getStore(id));
    const result = await runPollForAll({ stores, dryRun });
    if (!dryRun) await recordRun(getRawStore(), { ok: true, notify: pushTo(owner) });
    return result;
  } catch (error) {
    if (!dryRun) await recordRun(getRawStore(), { ok: false, error: (error as Error).message });
    throw error;
  } finally {
    await owner.unlock('poll');
  }
}

/** Push the owner if the poller has gone quiet (see lib/health.js). */
export async function checkPoller() {
  const owner = getStore();
  const { timeZone } = await readSettings(owner);
  return watchdog(getRawStore(), { notify: pushTo(owner), timeZone });
}
