import type { ReactNode } from 'react';

/**
 * Big uppercase title with a tiny mono caption and a section index: `01 ─ TITLE`.
 * The caption and index are decoration, so they are hidden from assistive tech.
 */
export function SectionHeader({
  index,
  caption,
  children,
}: {
  index?: string;
  caption?: string;
  children: ReactNode;
}) {
  return (
    <header className="ef-section">
      {caption && <p className="ef-section__caption" aria-hidden="true">{caption}</p>}
      <h2 className="ef-section__title">
        {index && (
          <span aria-hidden="true" className="ef-section__index">{index} ─ </span>
        )}
        {children}
      </h2>
    </header>
  );
}
