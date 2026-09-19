'use client';

import { useEffect } from 'react';
import { TabBar } from './ui';
import { TabIcon } from './Decor';

const TABS = [
  { href: '/', label: 'Now', icon: <TabIcon name="now" /> },
  { href: '/t', label: 'Events', icon: <TabIcon name="events" /> },
  { href: '/follow', label: 'Follow', icon: <TabIcon name="follow" /> },
  { href: '/settings', label: 'Settings', icon: <TabIcon name="settings" /> },
];

/** Bottom tab bar + service worker registration (offline copy and push). */
export function AppChrome() {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
  return <TabBar items={TABS} />;
}
