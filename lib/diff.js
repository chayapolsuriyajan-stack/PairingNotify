/**
 * Work out which pairings are new since the last poll.
 *
 * Two rules matter more than the rest:
 *
 *  1. A tournament seen for the first time is *seeded silently*. Adding a tournament
 *     you are already three rounds into must not dump three notifications on your
 *     lock screen.
 *  2. Only genuinely paired rounds count. Byes, forfeits and empty placeholder rows
 *     are recorded in state but never notified.
 */

/** Key for one player in one tournament. */
export function stateKey(tournamentId, startNo) {
  return `${tournamentId}:${startNo}`;
}

/**
 * @param {object} previousState  Full previous state.json contents.
 * @param {Array<{tournamentId:string, tournamentTitle:string, url:string,
 *                startNo:number, rounds:Array}>} observations
 * @returns {{ newPairings: Array, nextState: object, seeded: string[] }}
 */
export function diffPairings(previousState, observations) {
  const previous = previousState?.players ?? {};
  const nextPlayers = {};
  const newPairings = [];
  const seeded = [];

  for (const observation of observations) {
    const key = stateKey(observation.tournamentId, observation.startNo);
    const before = previous[key];
    const seenRounds = new Set(before?.seenRounds ?? []);
    const isFirstSight = before === undefined;

    for (const round of observation.rounds) {
      if (!round.paired) continue;
      if (seenRounds.has(round.round)) continue;

      seenRounds.add(round.round);
      if (isFirstSight) {
        // Seeding: record it, stay quiet.
        continue;
      }
      newPairings.push({
        tournamentId: observation.tournamentId,
        tournamentTitle: observation.tournamentTitle,
        url: observation.url,
        ...round,
      });
    }

    if (isFirstSight) seeded.push(key);

    nextPlayers[key] = {
      tournamentId: observation.tournamentId,
      tournamentTitle: observation.tournamentTitle,
      startNo: observation.startNo,
      seenRounds: [...seenRounds].sort((a, b) => a - b),
      lastSeenAt: new Date().toISOString(),
    };
  }

  // Keep state for tournaments not polled this run (discovery may have been degraded),
  // so a temporary blip does not re-seed and then re-notify old rounds later.
  for (const [key, value] of Object.entries(previous)) {
    if (!(key in nextPlayers)) nextPlayers[key] = value;
  }

  return { newPairings, nextState: { version: 1, players: nextPlayers }, seeded };
}
