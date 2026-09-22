'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentProps } from 'react';

/** Same-origin app paths; a full URL (chess-results) is not ours to transition. */
function isInternal(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('//');
}

/**
 * next/link that tags the navigation so the outgoing screen dissolves into the
 * incoming one (see components/Screen.tsx and the pixel dissolve in motion.css).
 * Navigating to the page you are already on is not tagged: there is nothing to show.
 */
export default function NavLink(props: ComponentProps<typeof Link>) {
  const pathname = usePathname();
  const href = typeof props.href === 'string' ? props.href : (props.href.pathname ?? '/');
  const path = href.split(/[?#]/)[0];
  const transition = isInternal(href) && path !== pathname;
  return <Link {...props} transitionTypes={props.transitionTypes ?? (transition ? ['px'] : undefined)} />;
}
