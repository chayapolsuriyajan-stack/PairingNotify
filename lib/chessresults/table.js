/**
 * Header-driven table extraction for chess-results pages.
 *
 * chess-results renders every listing as an HTML <table> whose columns vary by
 * tournament settings (rating systems shown, club column on/off, sex/title columns...).
 * Reading by fixed column index therefore breaks constantly. Instead we locate the
 * header row, map header text to column index, and read cells by name.
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

/**
 * Find the first table on the page that contains all of `required` header labels.
 *
 * @param {string} html
 * @param {string[][]} required  Each entry is a list of acceptable aliases for one
 *                               required column, e.g. [['rd','round'], ['name']].
 * @returns {{ $: cheerio.CheerioAPI, table: any, columns: Record<string, number> }}
 */
export function findTable(html, required) {
  const $ = cheerio.load(html);
  const tables = $('table').toArray();

  for (const table of tables) {
    const headerRow = $(table).find('tr').toArray().find((row) => {
      const cells = $(row).find('th, td').toArray();
      if (cells.length < 2) return false;
      const labels = cells.map((cell) => normaliseHeader($(cell).text()));
      return required.every((aliases) =>
        aliases.some((alias) => labels.includes(normaliseHeader(alias))),
      );
    });

    if (!headerRow) continue;

    const columns = {};
    $(headerRow)
      .find('th, td')
      .toArray()
      .forEach((cell, index) => {
        const key = normaliseHeader($(cell).text());
        // First occurrence wins: chess-results sometimes repeats a label
        // (e.g. two rating columns) and the leftmost is the primary one.
        if (key && !(key in columns)) columns[key] = index;
      });

    return { $, table, headerRow, columns };
  }

  const seen = tables
    .slice(0, 10)
    .map((t) => clean($(t).find('tr').first().text()).slice(0, 90))
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

/** Read the data rows of a table (everything after the header row). */
export function dataRows($, table, headerRow) {
  const rows = $(table).find('tr').toArray();
  const headerIndex = rows.indexOf(headerRow);
  return rows.slice(headerIndex + 1);
}

/** Parse an integer, returning null for blanks and non-numeric cells. */
export function toInt(text) {
  const value = clean(text).replace(/[^\d-]/g, '');
  if (!value || Number.isNaN(Number(value))) return null;
  return Number.parseInt(value, 10);
}
