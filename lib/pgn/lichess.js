/**
 * Load a Lichess study from its link, so nobody has to export and paste the PGN.
 *
 *   https://lichess.org/study/AbCd1234            whole study
 *   https://lichess.org/study/AbCd1234/XyZ98765   a chapter link still means the study
 *
 * Lichess serves public and unlisted studies at /api/study/<id>.pgn; private ones too
 * once you are signed in with Lichess (lib/client/lichess.ts), which is also what lets
 * the renamer rename the chapters in the study itself (renameChaptersInPlace below).
 */

import { splitGames } from './study.js';

const ID = /^[A-Za-z0-9]{8}$/;

/** The 8-character study id from a link or a bare id, or null. */
export function studyIdFrom(input) {
  const text = String(input ?? '').trim();
  if (ID.test(text)) return text;
  const match = text.match(/lichess\.org\/study\/([A-Za-z0-9]{8})(?:[/?#]|$)/i);
  return match ? match[1] : null;
}

export function studyExportUrl(id) {
  return `https://lichess.org/api/study/${id}.pgn`;
}

/** What to tell the player when Lichess says no. */
export function studyError(status) {
  if (status === 404) return 'Study not found. Check the link.';
  if (status === 401 || status === 403) {
    return 'That study is private. Set it to Unlisted or Public on Lichess, or export the PGN and paste it.';
  }
  if (status === 429) return 'Lichess asked us to slow down. Try again in a minute.';
  return `Lichess answered ${status}. Try again, or export the PGN and paste it.`;
}

/** Lichess's limit on chapters in one study (lila Study.maxChapters). */
export const MAX_CHAPTERS = 64;

const CHAPTER_URL = /^\[ChapterURL "https?:\/\/lichess\.org\/study\/([A-Za-z0-9]{8})\/([A-Za-z0-9]{8})"\]/m;

/**
 * Which study chapter each game came from, read off the [ChapterURL] tag Lichess puts
 * in every exported chapter. null for a game without one (a pasted, non-Lichess PGN).
 *
 * @param {string[]} games  one PGN text per game (splitGames().games)
 * @returns {Array<{studyId: string, chapterId: string} | null>}
 */
export function chapterRefs(games) {
  return games.map((game) => {
    const match = game.match(CHAPTER_URL);
    return match ? { studyId: match[1], chapterId: match[2] } : null;
  });
}

/**
 * A renamed game as it should be sent back to Lichess: without the tags Lichess adds on
 * export (they would point at the chapter being replaced). Everything else, moves and
 * comments included, goes as it is.
 */
export function forImport(game) {
  return game.replace(/^\[(?:ChapterURL|StudyName) "[^"\r\n]*"\]\r?\n/gm, '');
}

/**
 * Batches for replacing `count` chapters in a study that has `current` chapters, never
 * going over the 64-chapter limit: import a batch of renamed copies, then delete the
 * originals they replace, which frees room for the next batch. New chapters go to the
 * end, so after the last batch they are in the original order.
 *
 * @returns {number[]} batch sizes, or null when there is no room even for one chapter
 */
export function replaceBatches(count, current, max = MAX_CHAPTERS) {
  // Each batch adds `size` copies and then deletes `size` originals, so the free room is
  // the same before every batch.
  const room = max - current;
  if (count > 0 && room <= 0) return null;
  const batches = [];
  for (let left = count; left > 0; left -= room) batches.push(Math.min(room, left));
  return batches;
}

/**
 * Rename a study's chapters in place: add renamed copies (Lichess names each one from its
 * [ChapterName]), then delete the originals. Copies go in before anything is deleted, so
 * a failure part-way leaves extra chapters, never missing ones.
 *
 * @param {(path: string, init?: object) => Promise<{json(): Promise<any>, text(): Promise<string>}>} call
 *        an authenticated request to lichess.org that throws on a failed status
 * @param {string} renamedPgn  the renamer's output for the study (every chapter, in order)
 * @param {(done: number, total: number) => void} [onProgress]
 * @returns {Promise<{studyId: string, replaced: number}>}
 */
export async function renameChaptersInPlace(call, renamedPgn, onProgress = () => {}) {
  const { games } = splitGames(renamedPgn);
  const refs = chapterRefs(games);
  if (games.length === 0 || refs.some((r) => !r)) {
    throw new Error('This PGN has no Lichess chapter links. Load the study by its link first.');
  }
  const studyId = refs[0].studyId;
  if (refs.some((r) => r.studyId !== studyId)) throw new Error('These chapters come from more than one study.');

  // The study as it is now: every chapter we replace must still be there.
  const current = await (await call(`/api/study/${studyId}.pgn`)).text();
  const now = new Set(chapterRefs(splitGames(current).games).map((r) => r?.chapterId));
  if (refs.some((r) => !now.has(r.chapterId))) {
    throw new Error('The study changed since you loaded it. Load it again, then rename.');
  }

  const batches = replaceBatches(games.length, now.size);
  if (!batches) throw new Error('The study is full (64 chapters), so there is no room for the renamed copies.');

  let done = 0;
  onProgress(0, games.length);
  for (const size of batches) {
    const body = await (
      await call(`/api/study/${studyId}/import-pgn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ pgn: games.slice(done, done + size).map(forImport).join('\n\n') }),
      })
    ).json();
    const added = body.chapters?.length ?? 0;
    if (added !== size) {
      throw new Error(
        `Lichess added ${added} of ${size} chapters${body.error ? ` (${body.error})` : ''}. ` +
          `${done} were renamed before this; nothing else was deleted.`,
      );
    }
    for (const ref of refs.slice(done, done + size)) await call(`/api/study/${studyId}/${ref.chapterId}`, { method: 'DELETE' });
    done += size;
    onProgress(done, games.length);
  }
  return { studyId, replaced: done };
}
