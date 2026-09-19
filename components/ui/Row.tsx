import type { ReactNode } from 'react';

/** Full-width list row split by hairlines; `active` adds the yellow left bar. */
export function RowList({ children }: { children: ReactNode }) {
  return <ul className="ef-rows">{children}</ul>;
}

export function Row({
  active = false,
  tick,
  leading,
  trailing,
  children,
}: {
  active?: boolean;
  /** Piece colour shown as a 2px tick on the left edge. */
  tick?: 'white' | 'black';
  /** Mono value on the left, e.g. round number. */
  leading?: ReactNode;
  /** Right-aligned tabular mono value, e.g. result or rating. */
  trailing?: ReactNode;
  children: ReactNode;
}) {
  const cls = ['ef-row', active && 'ef-row--active', tick && `ef-row--tick-${tick}`]
    .filter(Boolean)
    .join(' ');
  return (
    <li className={cls}>
      {leading !== undefined && <span className="ef-row__lead">{leading}</span>}
      <span className="ef-row__main">{children}</span>
      {trailing !== undefined && <span className="ef-row__trail">{trailing}</span>}
    </li>
  );
}
