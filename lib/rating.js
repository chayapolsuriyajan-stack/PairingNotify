/**
 * FIDE rating change, game by game: change = K × (score − expected).
 *
 * chess-results prints only the event total ("FIDE rtg +/- 7,4"), so each game is
 * worked out here (FIDE B.02 8.5): the expected score comes from the rating difference,
 * capped at 400 points. K depends on things the card doesn't show (age, games played,
 * having ever reached 2400), so when the official total is published, K is the value
 * that reproduces it; otherwise 20, or 10 from 2400 up, the usual adult values.
 */

export const K_VALUES = [10, 20, 40];

/** Expected score against `opponent`, with FIDE's 400-point cap. */
export function expectedScore(own, opponent) {
  const diff = Math.max(-400, Math.min(400, opponent - own));
  return 1 / (1 + 10 ** (diff / 400));
}

export function defaultK(rating) {
  return rating >= 2400 ? 10 : 20;
}

/** A played game's score, or null for forfeits, byes and results not in yet. */
function gameScore(result) {
  const t = String(result ?? '').trim().replace(',', '.');
  if (t === '1') return 1;
  if (t === '0') return 0;
  if (t === '½' || t === '0.5' || t === '1/2') return 0.5;
  return null;
}

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * @param {Array<{round:number, rating:number|null, result:string|null, paired:boolean}>} rounds
 * @param {{rating?: number|null, official?: number|null}} player
 *        rating: the player's FIDE rating; official: chess-results' published total, if any
 * @returns {{games: Array<{round:number, expected:number, change:number}>, total:number,
 *            k:number, kFrom:'official'|'default'} | null}  null for an unrated player
 */
export function ratingChanges(rounds, { rating, official = null } = {}) {
  if (!rating) return null;
  const rated = [];
  for (const r of rounds) {
    const score = r.paired ? gameScore(r.result) : null;
    if (score == null || !r.rating) continue; // unrated opponents don't count
    const expected = expectedScore(rating, r.rating);
    rated.push({ round: r.round, expected, delta: score - expected });
  }

  const sum = rated.reduce((s, g) => s + g.delta, 0);
  let k = defaultK(rating);
  if (official != null && Math.abs(sum) > 0.05) {
    // The published total wins. It can differ a little from the card (an opponent's
    // printed rating isn't always the FIDE one used), so share it out over the games in
    // proportion to how each went; the games then add up to the official number.
    const implied = official / sum;
    const nearest = K_VALUES.reduce((a, b) => (Math.abs(b - implied) < Math.abs(a - implied) ? b : a));
    if (Math.abs(nearest - implied) / nearest < 0.25) k = nearest;
    const games = rated.map((g) => ({ round: g.round, expected: g.expected, change: round1(implied * g.delta) }));
    return { games, total: official, k, kFrom: 'official' };
  }

  const games = rated.map((g) => ({ round: g.round, expected: g.expected, change: round1(k * g.delta) }));
  return { games, total: round1(k * sum), k, kFrom: 'default' };
}
