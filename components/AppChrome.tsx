'use client';

import { useEffect } from 'react';
import { TabBar } from './ui';
import { TabIcon } from './Decor';
import { Toaster } from './Motion';

const TABS = [
  { href: '/', label: 'Now', icon: <TabIcon name="now" /> },
  { href: '/t', label: 'Events', icon: <TabIcon name="events" /> },
  { href: '/follow', label: 'Follow', icon: <TabIcon name="follow" /> },
  { href: '/settings', label: 'Settings', icon: <TabIcon name="settings" /> },
];

/**
 * App-wide chrome: bottom tab bar, toast strip, and service worker registration.
 * The screen-to-screen dissolve itself is pure CSS on the view transition (motion.css
 * §L) — nothing here has to stay in step with the router.
 */
export function AppChrome() {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  return (
    <>
      <Toaster />
      <TabBar items={TABS} />
    </>
  );
}
