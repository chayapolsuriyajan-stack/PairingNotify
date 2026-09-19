'use client';

import { useEffect } from 'react';
import { TabBar } from './ui';

const TABS = [
  { href: '/', label: 'Now' },
  { href: '/t', label: 'Events' },
  { href: '/follow', label: 'Follow' },
  { href: '/settings', label: 'Settings' },
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
