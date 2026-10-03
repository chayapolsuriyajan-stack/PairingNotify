/**
 * Lichess study PGN renamer: the pure logic. No DOM and no I/O, so it is tested offline
 * and runs unchanged in the browser.
 *
 * A study export names every chapter in its [Event] tag ("<Study>: <Chapter>"). This
 * rewrites that tag so each chapter reads "<Opponent> <Score>", score from the
 * exporter's side, and changes nothing else: the moves, comments, variations, NAGs,
 * every other tag, blank lines and line endings all stay byte-for-byte as they came in.
 * That is why games are cut out of the text with a split rather than parsed and
 * re-serialised, and why only the two tag lines are ever touched.
 *
 * Real study exports often have no [White]/[Black] and `[Result "*"]` on every chapter,
 * so opponent and score cannot come from the tags alone. Each field is therefore filled
 * from the first source that has it, in this order:
 *
 *   1. [White]/[Black] when one of them is you (needs your username; a "*" result is
 *      ignored, the opponent still counts);
 *   2. the chess-results rows you pasted, matched to games in order;
 *   3. the existing chapter/event name, "<name> 1-0", after stripping "<StudyName>: ";
 *   4. a result comment at the end of the moves, "{ 1-0 }".
 *
 * Scores read from names (3) and comments (4) are taken as already being from your
 * side: neither carries a colour to convert with.
 */

export const DEFAULT_TEMPLATE = '{opponent} {score}';

/** The three outcomes, in the order a score picker lists them. */
export const SCORES = ['1-0', '0-1', '1/2-1/2'];

/** Consecutive tag lines at the very start of a game. */
const HEADER = /^(?:\[[^\r\n]*(?:\r\n|\r|\n|$))+/;
const TAG = /^\[([^\s\]"]+)\s+"((?:[^"\\]|\\.)*)"\]/;
const EVENT_LINE = /^\[Event\s+"(?:[^"\\]|\\.)*"\]/;
const CHAPTER_LINE = /^\[ChapterName\s+"(?:[^"\\]|\\.)*"\]/m;

const TITLE_SCORE = /^(.*\S)\s+(1-0|0-1|1\/2-1\/2|½-½)$/;
const END_COMMENT = /\{\s*(1-0|0-1|1\/2-1\/2|½-½)\s*\}\s*(?:1-0|0-1|1\/2-1\/2|½-½|\*)?\s*$/;

const FLIP = { '1-0': '0-1', '0-1': '1-0', '1/2-1/2': '1/2-1/2' };

/** "1-0", "0-1", "1/2-1/2" or "½-½" (spaces ignored) -> a score; anything else -> "". */
export function normaliseResult(text) {
  const t = String(text ?? '').replace(/\s+/g, '');
  if (t === '1-0' || t === '0-1') return t;
  if (t === '1/2-1/2' || t === '½-½') return '1/2-1/2';
  return '';
}

/**
 * A name made safe to sit inside a PGN tag value: double quotes become single quotes
 * (an unescaped quote ends the tag early), backslashes become slashes (they escape the
 * next character), and stray whitespace, including newlines, collapses to one space.
 */
export function cleanTagValue(text) {
  return String(text ?? '')
    .replace(/"/g, "'")
    .replace(/\\/g, '/')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * "Surname, Given" -> "Given Surname" (the default), or kept as "Surname, Given".
 * A name with no comma is left alone, and chess-results' "Myat Kaung," (no given name)
 * comes out as just the surname either way.
 *
 * @param {string} name
 * @param {'first-last'|'last-first'} [order]
 */
export function formatName(name, order = 'first-last') {
  const text = String(name ?? '').replace(/\s+/g, ' ').trim();
  const comma = text.indexOf(',');
  if (comma < 0) return text;
  const surname = text.slice(0, comma).trim();
  const given = text.slice(comma + 1).trim();
  if (!given) return surname;
  return order === 'last-first' ? `${surname}, ${given}` : `${given} ${surname}`;
}

/**
 * Cut a PGN into games. Each game starts at a line beginning `[Event "`: blank lines
 * are not trusted, since exports differ in how many they leave. Whatever comes before
 * the first game is kept as the preamble so it survives untouched, and the pieces
 * always join back into exactly the input.
 *
 * @param {string} text
 * @returns {{preamble: string, games: string[]}}
 */
export function splitGames(text) {
  const parts = String(text ?? '').split(/^(?=\[Event\s+")/m);
  const startsWithGame = /^\[Event\s+"/.test(parts[0] ?? '');
  return startsWithGame ? { preamble: '', games: parts } : { preamble: parts[0] ?? '', games: parts.slice(1) };
}

/**
 * Read one game's tags (values unescaped) without disturbing it.
 *
 * @param {string} chunk  one entry of splitGames().games
 * @returns {{header: string, movetext: string, tags: Record<string, string>}}
 */
export function readGame(chunk) {
  const header = chunk.match(HEADER)?.[0] ?? '';
  /** @type {Record<string, string>} */
  const tags = {};
  for (const line of header.split(/\r\n|\r|\n/)) {
    const match = line.match(TAG);
    if (match && !(match[1] in tags)) tags[match[1]] = match[2].replace(/\\(["\\])/g, '$1');
  }
  return { header, movetext: chunk.slice(header.length), tags };
}

/** The chapter's name as the study shows it, for display next to the new one. */
export function originalName(tags) {
  const chapter = (tags.ChapterName ?? '').trim();
  if (chapter) return chapter;
  const event = tags.Event ?? '';
  const prefix = tags.StudyName ? `${tags.StudyName}: ` : '';
  return prefix && event.startsWith(prefix) ? event.slice(prefix.length) : event;
}

/** "<name> 1-0" (or "(<name>) 1-0") out of the chapter name, else the event name. */
function parseChapterName(tags) {
  const prefix = tags.StudyName ? `${tags.StudyName}: ` : '';
  for (const raw of [tags.ChapterName, tags.Event]) {
    let text = String(raw ?? '').trim();
    if (prefix && text.startsWith(prefix)) text = text.slice(prefix.length).trim();
    const match = text.match(TITLE_SCORE);
    if (!match) continue;
    const wrapped = match[1].trim().match(/^\((.*)\)$/);
    const opponent = (wrapped ? wrapped[1] : match[1]).trim();
    if (opponent) return { opponent, score: normaliseResult(match[2]) };
  }
  return null;
}

/**
 * Everything one game can say about its opponent and score, one entry per source.
 * Each source is null when it has nothing to offer.
 *
 * @param {{tags: Record<string, string>, movetext: string}} game
 * @param {{username?: string}} [options]
 */
export function deriveFromGame(game, { username = '' } = {}) {
  const { tags, movetext } = game;
  const me = String(username).trim().toLowerCase();
  const layers = { tags: null, name: parseChapterName(tags), comment: null };

  if (me && tags.White && tags.Black) {
    const iAmWhite = tags.White.trim().toLowerCase() === me;
    const iAmBlack = tags.Black.trim().toLowerCase() === me;
    if (iAmWhite !== iAmBlack) {
      const result = normaliseResult(tags.Result); // "*" is not a result
      layers.tags = {
        opponent: (iAmWhite ? tags.Black : tags.White).trim(),
        score: result ? (iAmWhite ? result : FLIP[result]) : '',
      };
    }
  }

  const comment = movetext.match(END_COMMENT);
  if (comment) layers.comment = { score: normaliseResult(comment[1]) };
  return layers;
}

/** Lower-cased words of a name, accents folded, for the "is this the same person" check. */
function wordsOf(name) {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter((word) => word.length >= 2);
}

/**
 * @typedef {object} PlanEntry
 * @property {number} index         0-based position in the file
 * @property {string} original      the chapter's current name
 * @property {string} opponent      pre-filled opponent, "" when nothing had one
 * @property {string} score         "1-0" | "0-1" | "1/2-1/2", "" when nothing had one
 * @property {string} opponentFrom  "tags" | "chess-results" | "name" | ""
 * @property {string} scoreFrom     as above, plus "comment"
 * @property {string[]} notes       things worth a second look (disagreeing sources)
 */

/**
 * Pre-fill every game of a PGN from the sources above.
 *
 * @param {string} text
 * @param {object} [options]
 * @param {string} [options.username]
 * @param {Array<{name: string, score: string}>} [options.rows]  chess-results rows, in
 *        round order; `name` is "Surname, Given"
 * @param {'first-last'|'last-first'} [options.nameOrder]
 * @returns {{entries: PlanEntry[], warnings: string[], studyName: string}}
 */
export function planGames(text, { username = '', rows = [], nameOrder = 'first-last' } = {}) {
  const { games } = splitGames(text);
  const warnings = [];
  if (rows.length > 0 && rows.length !== games.length) {
    warnings.push(
      `${rows.length} chess-results row${rows.length === 1 ? '' : 's'} for ${games.length} game${games.length === 1 ? '' : 's'}. ` +
        'Rows are matched to games in order, so check the pairs below.',
    );
  }

  let studyName = '';
  const entries = games.map((chunk, index) => {
    const game = readGame(chunk);
    studyName ||= game.tags.StudyName ?? '';
    const layers = deriveFromGame(game, { username });
    const row = rows[index] ?? null;

    const opponents = [
      ['tags', layers.tags?.opponent],
      ['chess-results', row?.name],
      ['name', layers.name?.opponent],
    ];
    const scores = [
      ['tags', layers.tags?.score],
      ['chess-results', row?.score],
      ['name', layers.name?.score],
      ['comment', layers.comment?.score],
    ];
    const [opponentFrom = '', opponent = ''] = opponents.find(([, value]) => value) ?? [];
    const [scoreFrom = '', score = ''] = scores.find(([, value]) => value) ?? [];

    const notes = [];
    const seen = scores.filter(([, value]) => value);
    if (new Set(seen.map(([, value]) => value)).size > 1) {
      notes.push(`Sources disagree on the score: ${seen.map(([from, value]) => `${from} ${value}`).join(', ')}.`);
    }
    if (row && layers.name && !wordsOf(row.name).some((word) => wordsOf(layers.name.opponent).includes(word))) {
      notes.push(`Chapter says "${layers.name.opponent}" but chess-results row ${index + 1} is "${row.name}".`);
    }

    return {
      index,
      original: originalName(game.tags),
      opponent: formatName(opponent, nameOrder),
      score,
      opponentFrom,
      scoreFrom,
      notes,
    };
  });

  return { entries, warnings, studyName };
}

/**
 * Fill {opponent} and {score} into the template and make the result safe for a tag.
 * Replacements are functions so a "$&" in a name is not read as a replacement pattern.
 */
export function renderName(template, { opponent, score }) {
  return cleanTagValue(
    String(template ?? DEFAULT_TEMPLATE)
      .replaceAll('{opponent}', () => cleanTagValue(opponent))
      .replaceAll('{score}', () => score),
  );
}

/** Which fields the template needs that this entry still lacks. */
export function missingFields(entry, template = DEFAULT_TEMPLATE) {
  const missing = [];
  if (template.includes('{opponent}') && !cleanTagValue(entry.opponent)) missing.push('opponent');
  if (template.includes('{score}') && !entry.score) missing.push('score');
  return missing;
}

/** Swap the value of one game's [Event] tag (and [ChapterName], if present and asked for). */
function rewriteGame(chunk, name, updateChapterName) {
  const header = chunk.match(HEADER)?.[0] ?? '';
  let next = header.replace(EVENT_LINE, () => `[Event "${name}"]`);
  if (updateChapterName) next = next.replace(CHAPTER_LINE, () => `[ChapterName "${name}"]`);
  return next + chunk.slice(header.length);
}

/**
 * Rewrite the named games and leave every other byte of the PGN as it was.
 *
 * @param {string} text
 * @param {Array<string|null|undefined>} names  new name per game, falsy to leave a game alone
 * @param {{updateChapterName?: boolean}} [options]
 */
export function applyRenames(text, names, { updateChapterName = true } = {}) {
  const { preamble, games } = splitGames(text);
  return preamble + games.map((chunk, i) => (names[i] ? rewriteGame(chunk, names[i], updateChapterName) : chunk)).join('');
}

/**
 * Name every game that has what the template needs and keep the rest as they were.
 *
 * @param {string} text
 * @param {PlanEntry[]} entries  planGames() entries, with any edits already applied
 * @param {{template?: string, updateChapterName?: boolean}} [options]
 * @returns {{text: string, names: Array<string|null>}}  `names[i]` is null for a game left alone
 */
export function renameStudy(text, entries, { template = DEFAULT_TEMPLATE, updateChapterName = true } = {}) {
  const names = entries.map((entry) => (missingFields(entry, template).length ? null : renderName(template, entry)));
  return { text: applyRenames(text, names, { updateChapterName }), names };
}
