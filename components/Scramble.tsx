'use client';

import { useEffect, useState } from 'react';

const GLYPHS = '0123456789ABCDEFGHJKLMNPRSTUVWXYZ#/%';

/**
 * Text that cycles through random glyphs before settling (design.md §6). Only runs
 * when `active` (a pairing you haven't seen yet) and never with reduced motion.
 */
export function Scramble({ text, active }: { text: string; active: boolean }) {
  const [shown, setShown] = useState(text);

  useEffect(() => {
    if (!active || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(text);
      return;
    }
    let frame = 0;
    const frames = 14;
    const timer = setInterval(() => {
      frame++;
      const settled = Math.floor((frame / frames) * text.length);
      setShown(
        text
          .split('')
          .map((ch, i) => (i < settled || ch === ' ' ? ch : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]))
          .join(''),
      );
      if (frame >= frames) {
        clearInterval(timer);
        setShown(text);
      }
    }, 40);
    return () => clearInterval(timer);
  }, [text, active]);

  return (
    <>
      <span aria-hidden="true">{shown}</span>
      <span className="ef-sr">{text}</span>
    </>
  );
}
