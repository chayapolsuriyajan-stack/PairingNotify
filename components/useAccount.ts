'use client';

import type { Config, FeedResponse } from '@/lib/client/types';
import { useJson } from './useJson';

/** Server config + (once unlocked) the poller's feed of everyone you follow. */
export function useAccount({ refreshMs = 30_000 }: { refreshMs?: number } = {}) {
  const config = useJson<Config>('/api/config');
  const needsLogin = Boolean(config.data?.passcodeRequired && !config.data?.authed);
  const feed = useJson<FeedResponse>(config.data && !needsLogin ? '/api/feed' : null, { refreshMs });
  return { config, feed, needsLogin, unlock: () => config.reload() };
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
