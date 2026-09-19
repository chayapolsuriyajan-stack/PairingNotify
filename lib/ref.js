/**
 * Turn whatever the user pastes into a tournament reference:
 *   "1486488"
 *   "https://chess-results.com/tnr1486488.aspx?lan=1&art=9&snr=5"
 *   "s3.chess-results.com/tnr1486488.aspx"   (share-sheet links, mirror servers)
 *
 * @returns {{id:string, startNo:number|null} | null}
 */
export function parseTournamentRef(input) {
  const text = String(input ?? '').trim();
  if (/^\d{3,9}$/.test(text)) return { id: text, startNo: null };

  const match = text.match(/tnr(\d{3,9})\.aspx/i);
  if (!match) return null;
  const snr = text.match(/[?&]snr=(\d+)/i);
  return { id: match[1], startNo: snr ? Number(snr[1]) : null };
}

/** Tournament ids are digits only; anything else never reaches chess-results. */
export function isTournamentId(value) {
  return /^\d{3,9}$/.test(String(value ?? ''));
}
