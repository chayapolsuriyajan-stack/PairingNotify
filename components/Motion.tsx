'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/** True when the phone asks for reduced motion (JS-driven effects check this). */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Bumps a counter whenever `value` changes after the first render. Use the counter as a
 * React `key` to replay a CSS animation only when the data really changed.
 */
export function useChangeTick(value: unknown): number {
  const [tick, setTick] = useState(0);
  const previous = useRef(value);
  useEffect(() => {
    if (Object.is(previous.current, value)) return;
    previous.current = value;
    setTick((t) => t + 1);
  }, [value]);
  return tick;
}

/** Flicker + yellow flash when `value` changes (design.md: only when something changed). */
export function Changed({ value, children, className }: { value: unknown; children: ReactNode; className?: string }) {
  const tick = useChangeTick(value);
  return (
    <span key={tick} className={[tick > 0 ? 'ef-changed' : '', className].filter(Boolean).join(' ') || undefined}>
      {children}
    </span>
  );
}

/** Scanline sweep over the parent (which must be position: relative) when `value` changes. */
export function ScanLine({ value }: { value: unknown }) {
  const tick = useChangeTick(value);
  if (tick === 0) return null;
  return <span key={tick} className="ef-scan__line" aria-hidden="true" />;
}

/** Number that counts from its previous value to the new one (fast, ~260ms). */
export function CountUp({ value, format = (n) => String(Math.round(n)) }: { value: number; format?: (n: number) => string }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setShown(value);
      from.current = value;
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 260);
      const eased = 1 - (1 - t) ** 3;
      setShown(origin + (value - origin) * eased);
      if (t < 1) frame = requestAnimationFrame(step);
      else from.current = value;
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      from.current = value;
    };
  }, [value]);

  return <>{format(shown)}</>;
}

/** Segmented loading bar with a crawling hazard stripe, in place of a spinner. */
export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="ef-loading" role="status" aria-live="polite">
      <span className="ef-loading__label">{label}</span>
      <span className="ef-loading__bar" aria-hidden="true">
        {Array.from({ length: 12 }, (_, i) => (
          <span key={i} className="ef-loading__seg" style={{ '--i': i } as React.CSSProperties} />
        ))}
      </span>
      <span className="ef-loading__stripe" aria-hidden="true" />
    </div>
  );
}
