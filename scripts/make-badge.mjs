#!/usr/bin/env node
/**
 * Render the notification badge: public/icons/badge-96.png.
 *
 *   node scripts/make-badge.mjs
 *
 * Android does not draw a notification badge (the tiny status-bar mark) as a picture.
 * It keeps the ALPHA CHANNEL and fills every opaque pixel with one system colour, so
 * handing it a normal app icon — every pixel opaque — produces a featureless white
 * rounded square, which is exactly what this app used to show. A badge therefore has
 * to be a transparent image whose *shape* is the artwork.
 *
 * The shape is the reticle from the app icon: four corner brackets around a filled
 * centre square, which stays legible at 24dp.
 *
 * Unlike make-icons.mjs this writes the PNG itself instead of going through sharp: the
 * badge is flat rectangles, and a badge that anyone can regenerate without installing
 * an optional native dependency is worth more than sharing one code path.
 */

import { deflateSync } from 'node:zlib';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SIZE = 96;

/** A white, fully transparent canvas. Only the alpha channel will matter. */
const pixels = new Uint8Array(SIZE * SIZE * 4);
for (let i = 0; i < pixels.length; i += 4) {
  pixels[i] = 255;
  pixels[i + 1] = 255;
  pixels[i + 2] = 255;
}

function rect(x, y, w, h) {
  for (let py = Math.max(0, y); py < Math.min(SIZE, y + h); py++) {
    for (let px = Math.max(0, x); px < Math.min(SIZE, x + w); px++) {
      pixels[(py * SIZE + px) * 4 + 3] = 255;
    }
  }
}

const PAD = 10; // keeps the mark inside the circle Android may crop it to
const ARM = 26; // bracket arm length
const W = 9; // stroke
const FAR = SIZE - PAD - W;
const END = SIZE - PAD - ARM;

// Four corner brackets.
rect(PAD, PAD, ARM, W);
rect(PAD, PAD, W, ARM);
rect(END, PAD, ARM, W);
rect(FAR, PAD, W, ARM);
rect(PAD, FAR, ARM, W);
rect(PAD, END, W, ARM);
rect(END, FAR, ARM, W);
rect(FAR, END, W, ARM);
// The lit board square in the middle.
rect(SIZE / 2 - 15, SIZE / 2 - 15, 30, 30);

/** One IDAT-ready scanline block: each row prefixed with filter type 0 (none). */
function rawScanlines() {
  const stride = SIZE * 4;
  const out = Buffer.alloc((stride + 1) * SIZE);
  for (let y = 0; y < SIZE; y++) {
    out[y * (stride + 1)] = 0;
    Buffer.from(pixels.buffer, y * stride, stride).copy(out, y * (stride + 1) + 1);
  }
  return out;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // colour type: RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(rawScanlines(), { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const file = join(ROOT, 'public/icons/badge-96.png');
await writeFile(file, png);
console.log(`wrote ${file.replace(ROOT, '.')} (${png.length} bytes)`);
