/**
 * Load a Lichess study from its link, so nobody has to export and paste the PGN.
 *
 *   https://lichess.org/study/AbCd1234            whole study
 *   https://lichess.org/study/AbCd1234/XyZ98765   a chapter link still means the study
 *
 * Lichess serves public and unlisted studies at /api/study/<id>.pgn. Private studies
 * need the owner's token, which this app never asks for: those still go by export.
 */

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
