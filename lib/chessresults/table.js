/**
 * Header-driven table extraction for chess-results pages.
 *
 * chess-results renders every listing as an HTML <table> whose columns vary by
 * tournament settings (rating systems shown, club column on/off, sex/title columns...).
 * Reading by fixed column index therefore breaks constantly. Instead we locate the
 * header row, map header text to column index, and read cells by name.
 *
 * The page is also wrapped in a layout table, and result cells contain small nested
 * tables (the colour marker). So every lookup reads a table's *own* rows and a row's
 * *own* cells, never descendants of nested tables.
 */

import * as cheerio from 'cheerio';

/** Collapse whitespace/nbsp and trim. */
export function clean(text) {
  return String(text ?? '')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalise a header label for matching: lowercase, strip punctuation and spaces. */
function normaliseHeader(text) {
  return clean(text).toLowerCase().replace(/[.\s_-]/g, '');
}

/** A table's own rows, excluding rows of tables nested inside its cells. */
export function ownRows($, table) {
  return $(table)
    .children('tbody, thead, tfoot')
    .children('tr')
    .add($(table).children('tr'))
    .toArray();
}

/** A row's own cells, excluding cells of tables nested inside them. */
export function ownCells($, row) {
  return $(row).children('th, td').toArray();
}

/**
 * Find the first table on the page that contains all of `required` header labels.
 *
 * @param {string} html
 * @param {string[][]} required  Each entry is a list of acceptable aliases for one
 *                               required column, e.g. [['rd','round'], ['name']].
 * @returns {{ $: cheerio.CheerioAPI, table: any, headerRow: any, columns: Record<string, number> }}
 */
export function findTable(html, required) {
  const $ = typeof html === 'string' ? cheerio.load(html) : html;
  const tables = $('table').toArray();

  for (const table of tables) {
    const headerRow = ownRows($, table).find((row) => {
      const cells = ownCells($, row);
      if (cells.length < 2) return false;
      const labels = cells.map((cell) => normaliseHeader($(cell).text()));
      return required.every((aliases) =>
        aliases.some((alias) => labels.includes(normaliseHeader(alias))),
      );
    });

    if (!headerRow) continue;

    const columns = {};
    ownCells($, headerRow).forEach((cell, index) => {
      const key = normaliseHeader($(cell).text());
      // First occurrence wins: chess-results sometimes repeats a label
      // (e.g. two rating columns) and the leftmost is the primary one.
      if (key && !(key in columns)) columns[key] = index;
    });

    return { $, table, headerRow, columns };
  }

  const seen = tables
    .slice(0, 10)
    .map((t) => clean($(ownRows($, t)[0] ?? t).text()).slice(0, 90))
    .filter(Boolean);

  throw new Error(
    `No table found with columns ${JSON.stringify(required)}. ` +
      `chess-results markup has probably changed. First header rows seen: ${JSON.stringify(seen)}`,
  );
}

/**
 * Look up a column index by any of its aliases.
 * @returns {number} index, or -1 when the column is absent.
 */
export function columnIndex(columns, aliases) {
  for (const alias of aliases) {
    const key = normaliseHeader(alias);
    if (key in columns) return columns[key];
  }
  return -1;
}

/** Resolve every column group in `spec` ({key: aliases[]}) to an index (or -1). */
export function columnIndexes(columns, spec) {
  return Object.fromEntries(
    Object.entries(spec).map(([key, aliases]) => [key, columnIndex(columns, aliases)]),
  );
}

/** Read the data rows of a table (everything after the header row). */
export function dataRows($, table, headerRow) {
  const rows = ownRows($, table);
  const headerIndex = rows.indexOf(headerRow);
  return rows.slice(headerIndex + 1);
}

/** Parse an integer, returning null for blanks and non-numeric cells. */
export function toInt(text) {
  const value = clean(text).replace(/[^\d-]/g, '');
  if (!value || Number.isNaN(Number(value))) return null;
  return Number.parseInt(value, 10);
}

/** Parse a score like "5,5", "4½" or "4.5". Returns null for blanks. */
export function toScore(text) {
  const raw = clean(text).replace(',', '.');
  if (!raw) return null;
  const half = raw.includes('½') ? 0.5 : 0;
  const whole = raw.replace('½', '');
  const value = whole === '' ? 0 : Number(whole);
  return Number.isNaN(value) ? null : value + half;
}

/** Text of a cell (safe for index -1). */
export function cellText($, cells, index) {
  return index >= 0 && index < cells.length ? clean($(cells[index]).text()) : '';
}

/**
 * Piece colour from chess-results' marker div (`FarbewT` = white, `FarbesT` = black,
 * from German weiß/schwarz) or older glyph/class encodings.
 */
export function colourIn($, cell) {
  if (!cell) return null;
  const node = $(cell);
  const markup = `${node.attr('class') ?? ''} ${node.html() ?? ''}`.toLowerCase();
  if (/farbew|whitesquare|\bwhite\b/.test(markup)) return 'white';
  if (/farbes|farbeb|blacksquare|\bblack\b/.test(markup)) return 'black';
  const text = clean(node.text()).toLowerCase();
  if (text === 'w' || text === '⚪') return 'white';
  if (text === 'b' || text === 's' || text === '⚫') return 'black';
  return null;
}
