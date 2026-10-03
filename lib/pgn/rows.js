/**
 * Rows pasted from a chess-results player page (the art=9 view): one line per round,
 *
 *   Rd.  Bo.  SNo  [title]  Name ("Surname, Given")  Rtg  FED  Pts.  Res.
 *
 * Copied out of a browser the cells are tab-separated; copied through some other route
 * they are separated by two or more spaces; and a hand-typed row may be as little as
 * "Surname, Given 1". All three are read. `Pts.` is the opponent's score and `Res.` is
 * the pasted player's own result, which is why the last cell is the one that counts.
 *
 * chess-results is server-rendered and sends no CORS headers, so a browser cannot fetch
 * the page itself: the rows are pasted in.
 */

/** FIDE and national titles chess-results prints before a name. */
const TITLE = /^(?:A?W?(?:GM|IM|FM|CM)|W?NM)\s+/;

/**
 * One player's result cell -> a score from that player's side.
 * "1" "+" win, "0" "-" loss, "½" "0.5" "0,5" "1/2" draw; anything else is no result.
 */
export function scoreFromPoints(token) {
  const t = String(token ?? '').trim().replace(',', '.');
  if (t === '1' || t === '+') return '1-0';
  if (t === '0' || t === '-') return '0-1';
  if (t === '½' || t === '0.5' || t === '1/2') return '1/2-1/2';
  return '';
}

const cleanName = (cell) => cell.replace(/\s+/g, ' ').trim().replace(TITLE, '');

/** A cell that is a name: has a comma and at least one letter ("4,5" points is not one). */
const isName = (cell) => cell.includes(',') && /\p{L}/u.test(cell);

/**
 * @param {string} line
 * @returns {{name: string, score: string} | null}  null for a header, a bye or a blank
 */
export function parseRow(line) {
  const text = line.replace(/[\r\n]+$/, '');
  if (!text.trim()) return null;

  // Tabs first, keeping empty cells: an unplayed game has an empty Res. cell, and
  // dropping it would make the opponent's Pts. look like the result.
  let cells = text.split('\t');
  if (cells.length < 2) cells = text.trim().split(/\s{2,}/);

  if (cells.length >= 2) {
    const name = cells.find(isName);
    if (!name) return null;
    return { name: cleanName(name), score: scoreFromPoints(cells[cells.length - 1]) };
  }

  // One run of single-spaced words: "WCM Khantree, Napat 0", or a whole row with its
  // columns squashed together.
  const tokens = text.trim().split(/\s+/);
  const score = scoreFromPoints(tokens[tokens.length - 1]);
  if (score) tokens.pop();

  let start = 0;
  while (start < tokens.length && /^\d+$/.test(tokens[start])) start++; // Rd. Bo. SNo
  const comma = tokens.findIndex((token, i) => i >= start && token.includes(','));
  if (comma < 0) return null;
  let end = comma + 1;
  while (end < tokens.length && !/^\d/.test(tokens[end])) end++; // name ends at the rating
  const name = cleanName(tokens.slice(start, end).join(' '));
  return isName(name) ? { name, score } : null;
}

/**
 * @param {string} text
 * @returns {{rows: Array<{name: string, score: string}>, ignored: number}}
 *          `ignored` counts non-blank lines with no player in them (headers, byes)
 */
export function parseChessResultsRows(text) {
  const rows = [];
  let ignored = 0;
  for (const line of String(text ?? '').split(/\r\n|\r|\n/)) {
    if (!line.trim()) continue;
    const row = parseRow(line);
    if (row) rows.push(row);
    else ignored++;
  }
  return { rows, ignored };
}
