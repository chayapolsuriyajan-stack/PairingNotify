/**
 * Decorative motifs from design.md §4. All aria-hidden: they are metadata-as-ornament
 * and never carry information on their own.
 */

/** L-shaped "targeting reticle" ticks on the corners of the parent (position: relative). */
export function Brackets({ tone = 'accent' }: { tone?: 'accent' | 'muted' }) {
  return (
    <span className={`ef-brackets ef-brackets--${tone}`} aria-hidden="true">
      <span className="ef-brackets__tl" />
      <span className="ef-brackets__tr" />
      <span className="ef-brackets__bl" />
      <span className="ef-brackets__br" />
    </span>
  );
}

/** A row of thin ticks, every fifth one taller: a measuring ruler used as a divider. */
export function Ruler({ className }: { className?: string }) {
  return <span className={['ef-ruler', className].filter(Boolean).join(' ')} aria-hidden="true" />;
}

/** Pawn silhouette in the colour you play. */
export function Pawn({ colour }: { colour: 'white' | 'black' | null }) {
  return (
    <svg className={`ef-pawn ef-pawn--${colour ?? 'unknown'}`} viewBox="0 0 24 32" aria-hidden="true">
      <circle cx="12" cy="7" r="5" />
      <path d="M8 13h8l-1.5 3 3 10H6.5l3-10z" />
      <rect x="4" y="26" width="16" height="4" />
    </svg>
  );
}

type IconName = 'now' | 'events' | 'follow' | 'settings';

/** 22px line icons for the tab bar (stroke = currentColor). */
export function TabIcon({ name }: { name: IconName }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'square' as const,
    className: 'ef-tab__icon',
    'aria-hidden': true,
  };
  switch (name) {
    case 'now': // crosshair on the current board
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="7" />
          <path d="M12 2v5M12 17v5M2 12h5M17 12h5" />
          <rect x="10.5" y="10.5" width="3" height="3" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'events': // board grid
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" />
          <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
          <rect x="9" y="9" width="6" height="6" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'follow': // person with a signal bracket
      return (
        <svg {...common}>
          <circle cx="10" cy="8" r="3.5" />
          <path d="M3.5 20c.8-3.8 3.4-6 6.5-6s5.7 2.2 6.5 6" />
          <path d="M18 4h3v3M21 17v3h-3" />
        </svg>
      );
    case 'settings': // sliders
      return (
        <svg {...common}>
          <path d="M4 6h16M4 12h16M4 18h16" />
          <rect x="13" y="4" width="3" height="4" fill="currentColor" />
          <rect x="6" y="10" width="3" height="4" fill="currentColor" />
          <rect x="15" y="16" width="3" height="4" fill="currentColor" />
        </svg>
      );
  }
}
