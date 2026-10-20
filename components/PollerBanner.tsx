'use client';

import { useEffect, useState } from 'react';
import { HazardBanner } from '@/components/ui';
import type { FeedResponse } from '@/lib/client/types';
import { hhmm } from '@/lib/client/format';

/** Matches lib/health.js STALE_AFTER. */
const STALE_AFTER = 5 * 60_000;

/**
 * "Alerts paused": the poller hasn't run for a while, so no pairing alerts are going
 * out. Without this the app looks normal while being silently out of date.
 */
export function PollerBanner({ poller }: { poller: FeedResponse['poller'] }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  if (!poller?.lastRunAt || now - poller.lastRunAt <= STALE_AFTER) return null;
  return (
    <HazardBanner label="Alerts paused">
      No pairing check since {hhmm(new Date(poller.lastRunAt))}, so new pairings won&apos;t reach your lock screen.
      {poller.lastError ? ` Last error: ${poller.lastError}` : ' Check the cron-job.org job that calls /api/poll.'}
    </HazardBanner>
  );
}
