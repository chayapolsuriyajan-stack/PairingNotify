'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { TabBar } from './ui';
import { TabIcon } from './Decor';
import { Toaster } from './Motion';
import { navDirection } from './NavLink';

const TABS = [
  { href: '/', label: 'Now', icon: <TabIcon name="now" /> },
  { href: '/t', label: 'Events', icon: <TabIcon name="events" /> },
  { href: '/follow', label: 'Follow', icon: <TabIcon name="follow" /> },
  { href: '/settings', label: 'Settings', icon: <TabIcon name="settings" /> },
];

/**
 * App-wide chrome: bottom tab bar, toast strip, the thin yellow rule that leads each
 * screen wipe (design.md §6.3 L), and service worker registration.
 */
export function AppChrome() {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  return (
    <>
      <LeadingRule />
      <Toaster />
      <TabBar items={TABS} />
    </>
  );
}

/** On each route change, a 2px rule crosses the screen in the direction of travel. */
function LeadingRule() {
  const pathname = usePathname();
  const previous = useRef(pathname);
  const [sweep, setSweep] = useState<{ key: number; direction: 'forward' | 'back' } | null>(null);

  useEffect(() => {
    const from = previous.current;
    previous.current = pathname;
    if (from === pathname) return;
    const direction = navDirection(from, pathname);
    if (!direction) return;
    setSweep((s) => ({ key: (s?.key ?? 0) + 1, direction: direction === 'nav-forward' ? 'forward' : 'back' }));
  }, [pathname]);

  if (!sweep) return null;
  return <span key={sweep.key} className={`ef-sweep ef-sweep--${sweep.direction}`} aria-hidden="true" />;
}
