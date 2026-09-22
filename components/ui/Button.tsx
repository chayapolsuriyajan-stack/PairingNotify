'use client';

import Link from '@/components/NavLink';
import { haptic } from '@/lib/client/haptics';
import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from 'react';

type Common = {
  variant?: 'primary' | 'secondary';
  /** Trailing arrow glyph, as on in-game CTAs. */
  arrow?: boolean;
  children: ReactNode;
  className?: string;
};

type AsLink = Common & { href: string } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof Common>;
type AsButton = Common & { href?: undefined } & ButtonHTMLAttributes<HTMLButtonElement>;

/** Chamfered block button. Primary is signal yellow; secondary is a 1px outline. */
export function Button(props: AsLink | AsButton) {
  const { variant = 'primary', arrow, children, className, href, onClick, ...rest } = props;
  const cls = ['ef-btn', `ef-btn--${variant}`, className].filter(Boolean).join(' ');
  const content = (
    <>
      <span className="ef-btn__label">{children}</span>
      {arrow && <span aria-hidden="true" className="ef-btn__arrow">▶</span>}
    </>
  );

  // The press is confirmed in the hand as well as on screen (see lib/client/haptics).
  const press = (event: MouseEvent<HTMLElement>) => {
    haptic(variant === 'primary' ? 'select' : 'tick');
    (onClick as ((event: MouseEvent<HTMLElement>) => void) | undefined)?.(event);
  };

  if (href !== undefined) {
    return (
      <Link href={href} className={cls} onClick={press}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} onClick={press} {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}>
      {content}
    </button>
  );
}
