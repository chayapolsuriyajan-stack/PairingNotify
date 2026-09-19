import type { ReactNode } from 'react';

export type ChipTone = 'neutral' | 'accent' | 'info' | 'alert' | 'ok';

/** Small rectangular mono tag: ACTIVE, STANDBY, WHITE, BLACK ... */
export function Chip({
  tone = 'neutral',
  solid = false,
  children,
}: {
  tone?: ChipTone;
  solid?: boolean;
  children: ReactNode;
}) {
  return (
    <span className={`ef-chip ef-chip--${tone}${solid ? ' ef-chip--solid' : ''}`}>{children}</span>
  );
}
