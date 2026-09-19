'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Segmented control (tabs within a screen, round picker, WIN/DRAW/LOSS). A yellow ink
 * block slides to the selected option instead of jumping.
 */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
  scroll = false,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  scroll?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [ink, setInk] = useState<{ x: number; w: number } | null>(null);
  const ready = useRef(false);

  useLayoutEffect(() => {
    const measure = () => {
      const active = container.current?.querySelector<HTMLElement>('[aria-selected="true"]');
      setInk(active ? { x: active.offsetLeft, w: active.offsetWidth } : null);
      if (scroll && active) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, [value, options.length, scroll]);

  // The first position lands without sliding in from the left edge; after mount, every
  // change slides. (A plain effect, not requestAnimationFrame, which background tabs pause.)
  useEffect(() => {
    ready.current = true;
  }, []);

  return (
    <div
      ref={container}
      className={`ef-seg${scroll ? ' ef-seg--scroll' : ''}${ink ? ' ef-seg--inked' : ''}`}
      role="tablist"
      aria-label={label}
    >
      {ink && (
        <span
          className="ef-seg__ink"
          aria-hidden="true"
          style={{
            // transform only (§6.5): a 100px block, moved and scaled to the option
            transform: `translateX(${ink.x}px) scaleX(${ink.w / 100})`,
            transition: ready.current ? undefined : 'none',
          }}
        />
      )}
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          className={`ef-seg__item${option.value === value ? ' ef-seg__item--on' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
