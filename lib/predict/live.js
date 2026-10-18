/**
 * The round being played, as fresh as chess-results has it.
 *
 * The pairings page of the live round (art=2) is where arbiters enter results, and it
 * usually shows them before the crosstable (art=5) does; right after a round is paired
 * the crosstable may not have the new round at all. Folding that page into the
 * crosstable gives the forecast today's results and points instead of the last
 * crosstable rebuild's.
 */

/**
 * @param {{rounds:number, players:Array}} cross  parsed crosstable
 * @param {number} round                         the round the pairings page shows
 * @param {Array<{white:{startNo:number|null}, black:{startNo:number|null}|null,
 *                result:{white:number, black:number, forfeit:boolean}|null}>} games
 * @returns {{rounds:number, players:Array, live:{round:number, merged:number}}} a new crosstable
 */
export function mergeLiveResults(cross, round, games) {
  const byNo = new Map(cross.players.map((p) => [p.startNo, { ...p, games: [...p.games] }]));
  let merged = 0;

  const put = (no, cell) => {
    const p = byNo.get(no);
    if (!p) return;
    const i = p.games.findIndex((g) => g.round === round);
    const before = i >= 0 ? p.games[i] : null;
    // Never overwrite a result the crosstable already has; only fill gaps.
    if (before && before.kind !== 'pending') return;
    if (i >= 0) p.games[i] = { round, ...cell };
    else p.games.push({ round, ...cell });
    if (!before || cell.kind !== 'pending') merged++;
  };

  for (const game of games ?? []) {
    const w = game.white?.startNo;
    const b = game.black?.startNo;
    if (w == null || b == null) continue; // byes are already in the crosstable
    const r = game.result;
    const kind = !r ? 'pending' : r.forfeit ? 'forfeit' : 'game';
    put(w, { opponent: b, colour: 'white', score: r ? r.white : null, kind });
    put(b, { opponent: w, colour: 'black', score: r ? r.black : null, kind });
  }

  const players = [...byNo.values()].map((p) => ({ ...p, games: p.games.sort((a, c) => a.round - c.round) }));
  return { ...cross, rounds: Math.max(cross.rounds, games?.length ? round : 0), players, live: { round, merged } };
}

/** The round to read live: the crosstable's last one if unfinished, or a newer one. */
export function liveRound(cross, menu) {
  const last = cross.rounds;
  const unfinished = cross.players.some((p) => p.games.find((g) => g.round === last)?.kind === 'pending');
  const current = menu?.currentRound ?? null;
  if (current && current > last) return current;
  if (last >= 1 && unfinished) return last;
  return null;
}
