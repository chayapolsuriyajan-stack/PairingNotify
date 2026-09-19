#!/usr/bin/env node
/**
 * Renders the app icons from one SVG design (design.md: graphite, signal yellow,
 * chamfered corner, a 4x4 board with the "your board" square lit).
 *
 *   node scripts/make-icons.mjs
 *
 * Writes public/icons/*.png, app/apple-icon.png and app/icon.svg.
 */

import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GRAPHITE = '#1B1C1E';
const PANEL = '#26282B';
const SIGNAL = '#FFE500';
const PAPER = '#E9E9E6';
const INK = '#141414';

/**
 * @param {number} pad   inset of the artwork (larger for maskable icons, whose outer
 *                       20% may be cropped into a circle or squircle)
 */
function iconSvg({ pad = 64, background = GRAPHITE } = {}) {
  const size = 512;
  const inner = size - pad * 2;
  const cell = inner / 4;
  const squares = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const lit = r === 2 && c === 1;
      const light = (r + c) % 2 === 0;
      const fill = lit ? SIGNAL : light ? PAPER : PANEL;
      const x = pad + c * cell;
      const y = pad + r * cell;
      // 3px gutters read as the "ruled" grid from the design system.
      squares.push(`<rect x="${x + 3}" y="${y + 3}" width="${cell - 6}" height="${cell - 6}" fill="${fill}"/>`);
    }
  }
  const chamfer = 58;
  const tick = pad * 0.45;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" fill="${background}"/>
  <polygon points="0,0 ${size - chamfer},0 ${size},${chamfer} ${size},${size} 0,${size}" fill="${background}"/>
  ${squares.join('\n  ')}
  <!-- corner brackets (reticle) -->
  <g stroke="${SIGNAL}" stroke-width="10" fill="none" stroke-linecap="square">
    <path d="M${pad - 22},${pad - 22 + tick} V${pad - 22} H${pad - 22 + tick}"/>
    <path d="M${size - pad + 22},${size - pad + 22 - tick} V${size - pad + 22} H${size - pad + 22 - tick}"/>
  </g>
  <!-- chamfered corner mark -->
  <polygon points="${size - chamfer},0 ${size},0 ${size},${chamfer}" fill="${SIGNAL}"/>
  <!-- the lit square carries a small board-number tick -->
  <rect x="${pad + cell + cell * 0.36}" y="${pad + 2 * cell + cell * 0.36}" width="${cell * 0.28}" height="${cell * 0.28}" fill="${INK}"/>
</svg>`;
}

async function png(svg, size, file) {
  await sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toFile(file);
  console.log(`wrote ${file.replace(ROOT, '.')}`);
}

const regular = iconSvg();
const maskable = iconSvg({ pad: 118 });

await png(regular, 192, join(ROOT, 'public/icons/icon-192.png'));
await png(regular, 512, join(ROOT, 'public/icons/icon-512.png'));
await png(maskable, 512, join(ROOT, 'public/icons/icon-maskable-512.png'));
// iOS ignores transparency and rounds corners itself: use the maskable-safe layout.
await png(iconSvg({ pad: 92 }), 180, join(ROOT, 'app/apple-icon.png'));
await writeFile(join(ROOT, 'app/icon.svg'), regular);
console.log('wrote ./app/icon.svg');
