'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface JsonState<T> {
  data: T | undefined;
  error: string | null;
  status: number | null;
  loading: boolean;
  /** True when the service worker answered from its offline copy. */
  offline: boolean;
  updatedAt: number | null;
  reload: () => Promise<void>;
}

/**
 * Fetch JSON, refetch every `refreshMs` while the page is visible and whenever it comes
 * back to the foreground (the phone is unlocked at the board). Keeps the last good data
 * on errors so the screen never goes blank mid-tournament.
 */
export function useJson<T>(url: string | null, { refreshMs = 0 }: { refreshMs?: number } = {}): JsonState<T> {
  const [state, setState] = useState<Omit<JsonState<T>, 'reload'>>({
    data: undefined,
    error: null,
    status: null,
    loading: Boolean(url),
    offline: false,
    updatedAt: null,
  });
  const current = useRef(url);
  current.current = url;

  const load = useCallback(async () => {
    if (!url) return;
    try {
      const response = await fetch(url, { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (current.current !== url) return;
      if (!response.ok) {
        setState((s) => ({ ...s, loading: false, status: response.status, error: body.error ?? `HTTP ${response.status}` }));
        return;
      }
      setState({
        data: body as T,
        error: null,
        status: response.status,
        loading: false,
        offline: response.headers.get('X-From-Cache') === '1',
        updatedAt: Date.now(),
      });
    } catch {
      if (current.current !== url) return;
      setState((s) => ({ ...s, loading: false, offline: true, error: s.data ? null : 'Offline, and no saved copy yet.' }));
    }
  }, [url]);

  useEffect(() => {
    setState((s) => ({ ...s, loading: Boolean(url), error: null, data: url ? s.data : undefined }));
    load();
    if (!url) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    const timer = refreshMs ? setInterval(onVisible, refreshMs) : null;
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      if (timer) clearInterval(timer);
    };
  }, [url, load, refreshMs]);

  return { ...state, reload: load };
}
