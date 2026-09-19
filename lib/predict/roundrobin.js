/**
 * Round-robin schedules (FIDE Berger tables). In a round robin the next opponent is
 * fixed by the schedule, so there is nothing to simulate: pairing numbers are the
 * start numbers, and we confirm that by checking the rounds already played.
 */

/**
 * Pairings for one round of an n-player round robin (Berger tables). With an odd
 * number of players, the extra "player" n+1 is the bye. Double round robins repeat the
 * cycle with colours reversed.
 *
 * @returns {Array<{white:number, black:number}>}  start numbers; a bye has the dummy number
 */
export function bergerRound(n, round) {
  const size = n % 2 === 0 ? n : n + 1;
  const m = size - 1;
  const r = ((round - 1) % m) + 1;
  const secondCycle = Math.floor((round - 1) / m) % 2 === 1;
  const games = [];

  // The last player meets whoever satisfies 2i = r + 1 (mod m); white in even rounds.
  for (let i = 1; i <= m; i++) {
    if ((2 * i - r - 1) % m === 0) {
      games.push(r % 2 === 0 ? { white: size, black: i } : { white: i, black: size });
      break;
    }
  }
  // Everyone else meets the player whose number sums with theirs to r + 1 (mod m).
  for (let i = 1; i <= m; i++) {
    for (let j = i + 1; j <= m; j++) {
      if ((i + j - r - 1) % m !== 0) continue;
      games.push((i + j) % 2 === 1 ? { white: i, black: j } : { white: j, black: i });
    }
  }

  return secondCycle ? games.map(({ white, black }) => ({ white: black, black: white })) : games;
}

/**
 * Do the rounds already played follow the Berger schedule for these start numbers?
 * Used both to detect a round robin when the page doesn't say, and to decide whether
 * a schedule-based "next opponent" can be trusted.
 */
export function followsBerger(players, playedRounds) {
  const n = players.length;
  if (n < 3 || playedRounds < 1) return false;
  const byNo = new Map(players.map((p) => [p.startNo, p]));

  for (let round = 1; round <= playedRounds; round++) {
    for (const { white, black } of bergerRound(n, round)) {
      const w = byNo.get(white);
      const b = byNo.get(black);
      if (!w || !b) continue; // the bye
      const game = w.games.find((g) => g.round === round);
      if (!game || game.opponent == null) continue; // absent / forfeit without a game
      if (game.opponent !== black) return false;
    }
  }
  return true;
}
