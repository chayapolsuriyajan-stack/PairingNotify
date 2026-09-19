import { ViewTransition, type ReactNode } from 'react';

const DIRECTIONAL = { 'nav-forward': 'nav-forward', 'nav-back': 'nav-back', default: 'none' } as const;

/**
 * A screen's root. On a tagged navigation the outgoing screen wipes out in the
 * direction of travel and the incoming one wipes in behind it (design.md §6.3 L; CSS in
 * motion.css). Untagged updates — polls, browser back/forward — don't animate.
 * Must be rendered by each page, not the layout: layouts persist across navigations.
 */
export function Screen({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter={DIRECTIONAL} exit={DIRECTIONAL} default="none">
      <main className="ef-page">{children}</main>
    </ViewTransition>
  );
}
