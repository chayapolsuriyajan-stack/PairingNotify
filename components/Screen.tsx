import { ViewTransition, type ReactNode } from 'react';

/**
 * Every in-app navigation dissolves pixel by pixel (design.md §6.3 L; CSS in
 * motion.css). Direction is deliberately not encoded: on a four-tab bar a left/right
 * wipe made the screen sit still behind a moving line and then jump, which read as a
 * stall rather than as travel. `default: 'none'` keeps polls and browser back/forward
 * instant.
 */
const PIXEL = { px: 'px', default: 'none' } as const;

/**
 * A screen's root. Must be rendered by each page, not the layout: layouts persist
 * across navigations, so enter and exit never fire there.
 */
export function Screen({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter={PIXEL} exit={PIXEL} default="none">
      <main className="ef-page">{children}</main>
    </ViewTransition>
  );
}
