'use client';

import { useEffect } from 'react';
import type { Config, FeedResponse } from '@/lib/client/types';
import { useJson } from './useJson';

/** Server config + (once unlocked) the poller's feed of everyone you follow. */
export function useAccount({ refreshMs = 30_000 }: { refreshMs?: number } = {}) {
  const config = useJson<Config>('/api/config');
  const needsLogin = Boolean(config.data?.passcodeRequired && !config.data?.authed);
  const feed = useJson<FeedResponse>(config.data && !needsLogin ? '/api/feed' : null, { refreshMs });
  const authed = Boolean(config.data?.authed);
  useEffect(() => {
    if (authed) syncTimeZone();
  }, [authed]);
  return { config, feed, needsLogin, unlock: () => config.reload() };
}

/**
 * Round reminders read chess-results' local times in the account's time zone, so tell
 * the server this device's zone, once per change (not on every screen).
 */
function syncTimeZone() {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!zone || localStorage.getItem('pn:tz') === zone) return;
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeZone: zone }),
    })
      .then((r) => r.ok && localStorage.setItem('pn:tz', zone))
      .catch(() => {});
  } catch {
    // Storage blocked: Settings still sends the zone when opened.
  }
}

/** Remember the latest round seen per player/event, to animate genuinely new pairings only. */
export function markSeen(key: string, round: number): boolean {
  try {
    const previous = Number(localStorage.getItem(`pn:seen:${key}`) ?? 0);
    if (round > previous) {
      localStorage.setItem(`pn:seen:${key}`, String(round));
      return previous > 0;
    }
  } catch {
    // Storage blocked (private mode): just don't animate.
  }
  return false;
}
