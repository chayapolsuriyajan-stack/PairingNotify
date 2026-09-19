'use client';

/**
 * Motion helpers for design.md §6. CSS lives in app/motion.css; these components
 * decide *when* something animates: only when its data actually changed (§6.5).
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Counts changes of `value` after the first render. Use it as a React `key` to replay
 * an animation only when the data really changed — never on mount, never on a poll
 * that returned the same thing.
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

// ---------------------------------------------------------------------------
// C. Text scramble / decode
// ---------------------------------------------------------------------------

const CHARSET = '0123456789ABCDEF#/-';

/**
 * Codes and numbers cycle through random glyphs and lock in left to right (420ms).
 * Runs when `active` turns on, or when `text` changes while `decodeOnChange` is set.
 * Screen readers always get the final text (§6.5).
 */
export function Decode({
  text,
  active = false,
  decodeOnChange = false,
  delay = 0,
  duration = 420,
}: {
  text: string;
  active?: boolean;
  decodeOnChange?: boolean;
  delay?: number;
  duration?: number;
}) {
  const [shown, setShown] = useState(text);
  const tick = useChangeTick(text);

  useEffect(() => {
    const run = active || (decodeOnChange && tick > 0);
    if (!run || prefersReducedMotion() || !text) {
      setShown(text);
      return;
    }
    let frame = 0;
    let start = 0;
    const scrambled = () =>
      [...text].map((c) => (c === ' ' || c === ',' ? c : CHARSET[(Math.random() * CHARSET.length) | 0])).join('');
    setShown(scrambled());
    const step = (now: number) => {
      start ||= now + delay;
      const p = Math.max(0, Math.min((now - start) / duration, 1));
      const locked = Math.floor(p * text.length);
      setShown(
        [...text]
          .map((c, i) => (i < locked || c === ' ' || c === ',' ? c : CHARSET[(Math.random() * CHARSET.length) | 0]))
          .join(''),
      );
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    // Legibility first (design.md §8 guardrail 1): if animation frames are paused — a
    // background tab, a throttled webview — still land on the real text.
    const settle = setTimeout(() => {
      cancelAnimationFrame(frame);
      setShown(text);
    }, delay + duration + 150);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(settle);
    };
  }, [text, active, decodeOnChange, tick, delay, duration]);

  return (
    <>
      <span aria-hidden="true">{shown}</span>
      <span className="ef-sr">{text}</span>
    </>
  );
}

// ---------------------------------------------------------------------------
// D. Count-up numerals — from the old value to the new one, only on change
// ---------------------------------------------------------------------------

/** --ease-out: cubic-bezier(0.16, 1, 0.3, 1) is close to an exponential ease-out. */
const easeOut = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

export function CountUp({
  value,
  format = (n) => String(Math.round(n)),
  duration = 380,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
}) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    const origin = from.current;
    from.current = value;
    if (origin === value || prefersReducedMotion()) {
      setShown(value);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setShown(origin + (value - origin) * easeOut(t));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return (
    <>
      <span aria-hidden="true">{format(shown)}</span>
      <span className="ef-sr">{format(value)}</span>
    </>
  );
}

// ---------------------------------------------------------------------------
// E. Scan line and F. Flicker-on
// ---------------------------------------------------------------------------

/** A band sweeps once across the parent (give it `ef-scan-host`) when `value` changes. */
export function ScanLine({ value }: { value: unknown }) {
  const tick = useChangeTick(value);
  if (tick === 0) return null;
  return <span key={tick} className="ef-scan__line" aria-hidden="true" />;
}

/** Blinks 2–3 times over ~160ms when `value` changes (important state changes only). */
export function Flicker({ value, children, className }: { value: unknown; children: ReactNode; className?: string }) {
  const tick = useChangeTick(value);
  return (
    <span key={tick} className={[tick > 0 && 'ef-flicker', className].filter(Boolean).join(' ') || undefined}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// J. Segmented loading
// ---------------------------------------------------------------------------

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="ef-loading" role="status" aria-live="polite">
      <span className="ef-loading__label">{label}</span>
      <span className="ef-loading__bar" aria-hidden="true">
        {Array.from({ length: 12 }, (_, i) => (
          <span key={i} className="ef-loading__seg" style={{ '--i': i } as React.CSSProperties} />
        ))}
      </span>
    </div>
  );
}

/** "SYNC ···" — dots step in one at a time while a refresh is running (§6.6). */
export function SyncDots() {
  return (
    <>
      SYNC <span className="ef-dots">···</span>
    </>
  );
}

// ---------------------------------------------------------------------------
// K. Toast strip
// ---------------------------------------------------------------------------

export type ToastTone = 'accent' | 'alert' | 'ok';
interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
  time: string;
  leaving: boolean;
}

const listeners = new Set<(item: Omit<ToastItem, 'leaving'>) => void>();
/** Toasts raised before the Toaster mounted (a page's effects run before AppChrome's). */
const pending: Omit<ToastItem, 'leaving'>[] = [];
let nextId = 1;

/** Show a one-line system message: `toast('PAIRING CONFIRMED · RD 5 · BD 12')`. */
export function toast(message: string, tone: ToastTone = 'accent') {
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const item = { id: nextId++, message, tone, time };
  if (listeners.size === 0) pending.push(item);
  else listeners.forEach((listener) => listener(item));
}

const HOLD_MS = 3200;
const EXIT_MS = 160; // --t-fast

/** Mount once (AppChrome). Toasts enter from the bar, hold, then collapse back into it. */
export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (fn: () => void, ms: number) => {
      const t = setTimeout(() => {
        timers.delete(t);
        fn();
      }, ms);
      timers.add(t);
    };
    const add = (item: Omit<ToastItem, 'leaving'>) => {
      setItems((list) => [...list.slice(-2), { ...item, leaving: false }]);
      later(() => setItems((list) => list.map((x) => (x.id === item.id ? { ...x, leaving: true } : x))), HOLD_MS);
      later(() => setItems((list) => list.filter((x) => x.id !== item.id)), HOLD_MS + EXIT_MS);
    };
    listeners.add(add);
    pending.splice(0).forEach(add);
    return () => {
      listeners.delete(add);
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <div className="ef-toasts" role="status" aria-live="polite">
      {items.map((item) => (
        <div key={item.id} className={`ef-toast ef-toast--${item.tone}${item.leaving ? ' ef-toast--leaving' : ''}`}>
          <span className="ef-toast__bar" aria-hidden="true" />
          <span className="ef-toast__time">{item.time}</span>
          <span className="ef-toast__msg">
            <Decode text={item.message} active delay={320} duration={420} />
          </span>
        </div>
      ))}
    </div>
  );
}
