import Link from '@/components/NavLink';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

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
  const { variant = 'primary', arrow, children, className, href, ...rest } = props;
  const cls = ['ef-btn', `ef-btn--${variant}`, className].filter(Boolean).join(' ');
  const content = (
    <>
      <span className="ef-btn__label">{children}</span>
      {arrow && <span aria-hidden="true" className="ef-btn__arrow">▶</span>}
    </>
  );

  if (href !== undefined) {
    return <Link href={href} className={cls}>{content}</Link>;
  }
  return <button type="button" className={cls} {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}>{content}</button>;
}
