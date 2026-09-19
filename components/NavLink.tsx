'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentProps } from 'react';

/** Tab order, left to right. Anything under a tab's path belongs to that tab. */
const TABS = ['/', '/t', '/follow', '/settings'];

function locate(path: string) {
  const clean = path.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  const tab = clean === '/' ? 0 : Math.max(0, TABS.findIndex((t, i) => i > 0 && (clean === t || clean.startsWith(`${t}/`))));
  const depth = clean === '/' ? 0 : clean.split('/').length - 1;
  return { tab, depth };
}

/**
 * Direction of travel between two paths (design.md §6.3 L): across tabs it follows the
 * tab order; within a tab, going deeper is forward and coming back up is back.
 */
export function navDirection(from: string, to: string): 'nav-forward' | 'nav-back' | null {
  const a = locate(from);
  const b = locate(to);
  if (a.tab !== b.tab) return b.tab > a.tab ? 'nav-forward' : 'nav-back';
  if (a.depth !== b.depth) return b.depth > a.depth ? 'nav-forward' : 'nav-back';
  return null;
}

/** next/link that tags the navigation with its direction, for the screen wipe. */
export default function NavLink(props: ComponentProps<typeof Link>) {
  const pathname = usePathname();
  const href = typeof props.href === 'string' ? props.href : (props.href.pathname ?? '/');
  const direction = navDirection(pathname, href);
  return <Link {...props} transitionTypes={props.transitionTypes ?? (direction ? [direction] : undefined)} />;
}
