/**
 * A simplified FIDE Dutch Swiss pairer, used only to *predict* the next round.
 *
 * Real events are paired by Swiss-Manager / JaVaFo / bbpPairings, which implement the
 * full FIDE C.04.3 rules (float histories, exchange ordering, acceleration, arbiter
 * tweaks). This implements the parts that decide most pairings:
 *
 *  - players are ordered by score, then pairing number (the start number);
 *  - each score bracket is split into a top half (S1) and a bottom half (S2), and
 *    S1[i] plays S2[i], trying S2 transpositions (in lexicographic order) and then
 *    single S1<->S2 exchanges when that breaks a rule;
 *  - absolute rules: no rematches, no pairing of two players with the same absolute
 *    colour preference;
 *  - odd brackets float their lowest unpairable player down to the next bracket;
 *  - the bye goes to the lowest-ranked player without one;
 *  - colours follow the C.04.3 allocation order.
 *
 * Input is the parsed crosstable (see chessresults/pages.js parseCrosstable).
 */

const NODE_LIMIT = 4000;

/**
 * Player state for pairing round `round`, from games of earlier rounds only.
 * `overrides` maps "startNo:round" to a score, for simulated results of pending games.
 */
export function stateBefore(players, round, overrides = new Map()) {
  const scoreOf = (p, g) => {
    const key = `${p.startNo}:${g.round}`;
    return overrides.has(key) ? overrides.get(key) : g.score;
  };

  // Score of every player before each round, for float history.
  const before = new Map();
  for (const p of players) {
    const running = [0];
    for (const g of p.games) running.push(running[running.length - 1] + (scoreOf(p, g) ?? 0));
    before.set(p.startNo, running); // running[r - 1] = score before round r
  }

  return players.map((p) => {
    const games = p.games.filter((g) => g.round < round);
    let score = 0;
    const opponents = new Set();
    const colours = [];
    let hadBye = false;

    for (const g of games) {
      score += scoreOf(p, g) ?? 0;
      if (g.kind === 'bye') hadBye = true;
      if (g.opponent != null && (g.kind === 'game' || g.kind === 'pending')) {
        opponents.add(g.opponent);
        if (g.colour) colours.push(g.colour);
      }
    }

    // Did the player float in the previous round? (played someone on another score)
    const prev = games[games.length - 1];
    let floatedDown = false;
    let floatedUp = false;
    if (prev?.opponent != null && before.has(prev.opponent)) {
      const mine = before.get(p.startNo)[prev.round - 1];
      const theirs = before.get(prev.opponent)[prev.round - 1];
      floatedDown = mine > theirs;
      floatedUp = mine < theirs;
    } else if (prev?.kind === 'bye') {
      floatedDown = true; // a pairing-allocated bye counts as a downfloat
    }

    // Withdrawn: lost the last game by forfeit (a no-show), or missed two rounds running
    // (absent or forfeited). A single absence is often a requested bye, so it doesn't count.
    const noShow = (g) => g?.kind === 'absent' || (g?.kind === 'forfeit' && g.score === 0);
    const beforePrev = games[games.length - 2];
    const withdrawn =
      (prev?.kind === 'forfeit' && prev.score === 0) || (noShow(prev) && noShow(beforePrev));

    return { startNo: p.startNo, rating: p.rating, score, opponents, colours, hadBye, withdrawn, floatedDown, floatedUp };
  });
}

/**
 * Colour preference per FIDE C.04.1: absolute (colour difference beyond ±1, or the same
 * colour twice running), strong (difference ±1), mild (alternate), or none.
 * @returns {{colour:'white'|'black'|null, strength:0|1|2|3}}  3 = absolute
 */
export function colourPreference(colours) {
  if (colours.length === 0) return { colour: null, strength: 0 };
  const whites = colours.filter((c) => c === 'white').length;
  const diff = whites - (colours.length - whites);
  const [a, b] = colours.slice(-2);
  const other = (c) => (c === 'white' ? 'black' : 'white');

  if (diff < -1 || (a === 'black' && b === 'black')) return { colour: 'white', strength: 3 };
  if (diff > 1 || (a === 'white' && b === 'white')) return { colour: 'black', strength: 3 };
  if (diff === -1) return { colour: 'white', strength: 2 };
  if (diff === 1) return { colour: 'black', strength: 2 };
  return { colour: other(colours[colours.length - 1]), strength: 1 };
}

/** Higher score first, then lower start number. */
const byRank = (a, b) => b.score - a.score || a.startNo - b.startNo;

function compatible(a, b) {
  if (a.opponents.has(b.startNo)) return false;
  const pa = a.pref;
  const pb = b.pref;
  return !(pa.strength === 3 && pb.strength === 3 && pa.colour === pb.colour);
}

/**
 * Quality costs, in the order the Dutch rules rank them: a colour clash (both want
 * the same colour) outweighs any number of repeated floats.
 */
const CLASH = 100;
const REPEAT_FLOAT = 1;

function pairCost(a, b, mdp) {
  let cost = a.pref.colour && a.pref.colour === b.pref.colour ? CLASH : 0;
  // Pairing a floater up against someone who was also floated up last round.
  if (mdp && b.floatedUp) cost += REPEAT_FLOAT;
  return cost;
}

/**
 * Lowest possible number of colour clashes when pairing `players` among themselves:
 * the surplus of one colour wish over the other plus the players with no wish.
 */
function clashLowerBound(players, leftOut = 0) {
  let white = 0;
  let black = 0;
  let free = 0;
  for (const p of players) {
    if (p.pref.colour === 'white') white++;
    else if (p.pref.colour === 'black') black++;
    else free++;
  }
  return CLASH * Math.max(0, Math.ceil((Math.abs(white - black) - free - leftOut) / 2));
}

/**
 * Pair S1[i] with S2 members, enumerating S2 transpositions in lexicographic order
 * (DFS). Among complete assignments it keeps the first one with the fewest colour
 * clashes, which is how the Dutch system chooses between transpositions.
 *
 * @returns {{pairs, floaters, cost}|null}
 */
function assign(s1, s2, budget, best, mdp = false) {
  const used = new Array(s2.length).fill(false);
  const chosen = [];
  let found = null;

  const dfs = (i, cost) => {
    if (--budget.left < 0) return true; // out of budget: stop searching
    if (cost >= (found?.cost ?? best?.cost ?? Infinity)) return false;
    if (i === s1.length) {
      const paired = new Set(chosen.flat());
      const floaters = s2.filter((p) => !paired.has(p));
      const total = cost + REPEAT_FLOAT * floaters.filter((p) => p.floatedDown).length;
      if (total < (found?.cost ?? best?.cost ?? Infinity)) found = { pairs: [...chosen], floaters, cost: total };
      return total <= budget.target;
    }
    for (let j = 0; j < s2.length; j++) {
      if (used[j] || !compatible(s1[i], s2[j])) continue;
      used[j] = true;
      chosen.push([s1[i], s2[j]]);
      const stop = dfs(i + 1, cost + pairCost(s1[i], s2[j], mdp));
      chosen.pop();
      used[j] = false;
      if (stop) return true;
    }
    return false;
  };

  dfs(0, 0);
  return found;
}

/**
 * Pair a homogeneous bracket (everyone on the same score). Tries the maximum number
 * of pairs first; for that, the natural S1/S2 split, then single exchanges between S1
 * and S2 (lowest S1 with highest S2 first). Stops at the first candidate that reaches
 * the unavoidable minimum of colour clashes.
 */
function pairHomogeneous(list) {
  if (list.length < 2) return { pairs: [], floaters: list };

  const bestFor = (pairsWanted) => {
    const budget = { left: NODE_LIMIT, target: clashLowerBound(list, list.length - 2 * pairsWanted) };
    const s1 = list.slice(0, pairsWanted);
    const s2 = list.slice(pairsWanted);
    let best = assign(s1, s2, budget, null);

    for (let a = s1.length - 1; a >= 0 && (best?.cost ?? Infinity) > budget.target; a--) {
      for (let b = 0; b < s2.length && budget.left > 0; b++) {
        const x1 = [...s1];
        const x2 = [...s2];
        [x1[a], x2[b]] = [x2[b], x1[a]];
        x1.sort(byRank);
        x2.sort(byRank);
        const exchanged = assign(x1, x2, budget, best);
        if (exchanged && exchanged.cost < (best?.cost ?? Infinity)) best = exchanged;
        if ((best?.cost ?? Infinity) <= budget.target) break;
      }
    }
    return best;
  };

  for (let pairsWanted = Math.floor(list.length / 2); pairsWanted > 0; pairsWanted--) {
    const best = bestFor(pairsWanted);
    if (best) return best;
  }
  return { pairs: [], floaters: list };
}

/**
 * Pair one score bracket. Players who floated down from a higher bracket are paired
 * first, against the top of this bracket; the rest is then paired as usual.
 */
function pairBracket(floaters, residents) {
  if (floaters.length === 0) return pairHomogeneous(residents);

  const budget = { left: NODE_LIMIT, target: 0 };
  // Pair as many floaters as possible, highest first.
  for (let count = floaters.length; count > 0; count--) {
    const movers = floaters.slice(0, count);
    const res = assign(movers, residents, budget, null, true);
    if (!res) continue;
    const rest = pairHomogeneous(res.floaters);
    return {
      pairs: [...res.pairs, ...rest.pairs],
      floaters: [...floaters.slice(count), ...rest.floaters].sort(byRank),
    };
  }
  const rest = pairHomogeneous(residents);
  return { pairs: rest.pairs, floaters: [...floaters, ...rest.floaters].sort(byRank) };
}

/**
 * Pair whatever reaches the bottom unpaired, relaxing colour rules; rematches only
 * when `allowRematch` (the very last resort).
 */
function pairLeftovers(list, allowRematch = true) {
  const pairs = [];
  const rest = [...list];
  const take = (ok) => {
    for (let i = 0; i < rest.length; i++) {
      for (let j = i + 1; j < rest.length; j++) {
        if (ok(rest[i], rest[j])) {
          pairs.push([rest[i], rest[j]]);
          rest.splice(j, 1);
          rest.splice(i, 1);
          return true;
        }
      }
    }
    return false;
  };
  while (rest.length >= 2 && take((a, b) => !a.opponents.has(b.startNo)));
  while (allowRematch && rest.length >= 2 && take(() => true));
  return { pairs, unpaired: rest };
}

/** FIDE C.04.3 colour allocation for one pair. Returns [white, black]. */
function allocateColours(a, b) {
  const [hi, lo] = byRank(a, b) <= 0 ? [a, b] : [b, a];
  const other = (c) => (c === 'white' ? 'black' : 'white');
  const give = (p, colour) => (colour === 'white' ? [p, p === hi ? lo : hi] : [p === hi ? lo : hi, p]);

  const ph = hi.pref;
  const pl = lo.pref;
  if (ph.colour && pl.colour && ph.colour !== pl.colour) return give(hi, ph.colour);
  if (ph.strength !== pl.strength) {
    const stronger = ph.strength > pl.strength ? hi : lo;
    if (stronger.pref.colour) return give(stronger, stronger.pref.colour);
  }
  // Same strength and same wish: alternate from the latest round where they differed.
  for (let k = 1; k <= Math.min(hi.colours.length, lo.colours.length); k++) {
    const ch = hi.colours[hi.colours.length - k];
    const cl = lo.colours[lo.colours.length - k];
    if (ch !== cl) return give(hi, other(ch));
  }
  if (ph.colour) return give(hi, ph.colour);
  return give(hi, 'white');
}

/**
 * Predict the pairings of round `round`.
 *
 * @param {Array} players       parsed crosstable players
 * @param {number} round        the round to pair
 * @param {Map<string,number>} [overrides]  "startNo:round" -> score, for simulated results
 * @returns {{games: Array<{white:number, black:number}>, bye: number|null}}
 */
export function pairRound(players, round, overrides) {
  const state = stateBefore(players, round, overrides)
    .filter((p) => !p.withdrawn)
    .map((p) => ({ ...p, pref: colourPreference(p.colours) }));
  state.sort(byRank);

  let bye = null;
  if (state.length % 2 === 1) {
    const candidate = [...state].reverse().find((p) => !p.hadBye) ?? state[state.length - 1];
    bye = candidate.startNo;
    state.splice(state.indexOf(candidate), 1);
  }

  const brackets = [];
  for (const p of state) {
    const last = brackets[brackets.length - 1];
    if (last && last.score === p.score) last.players.push(p);
    else brackets.push({ score: p.score, players: [p] });
  }

  const pairs = [];
  const bracketPairs = [];
  let floaters = [];
  for (const bracket of brackets) {
    const result = pairBracket(floaters, bracket.players);
    bracketPairs.push(result.pairs);
    floaters = result.floaters;
  }

  // Players left at the bottom: reopen the brackets above, one at a time, and re-pair
  // everyone in them together (the "collapsed" last bracket) until nobody is left.
  let pool = floaters;
  while (pool.length > 0) {
    const sorted = [...pool].sort(byRank);
    const attempt = pairHomogeneous(sorted);
    const relaxed = attempt.floaters.length === 0 ? null : pairLeftovers(sorted, false);
    if (attempt.floaters.length === 0) {
      bracketPairs.push(attempt.pairs);
      pool = [];
    } else if (relaxed.unpaired.length === 0) {
      bracketPairs.push(relaxed.pairs);
      pool = [];
    } else if (bracketPairs.length > 0) {
      pool = [...pool, ...bracketPairs.pop().flat()];
    } else {
      // Nothing left to reopen: accept broken rules rather than leave players out.
      bracketPairs.push(pairLeftovers(pool).pairs);
      pool = [];
    }
  }
  pairs.push(...bracketPairs.flat());

  const games = pairs.map(([a, b]) => {
    const [white, black] = allocateColours(a, b);
    return { white: white.startNo, black: black.startNo };
  });
  return { games, bye };
}

/**
 * Replay a finished (or partly finished) event: for every round R >= 2 whose pairings
 * are known, predict R from rounds before it and count how many players got the
 * opponent the model said. This is the "how far to trust it" number.
 *
 * @returns {{rounds:Array<{round:number, hits:number, total:number}>, hits:number, total:number}}
 */
export function backtest(players, lastRound) {
  const rounds = [];
  for (let round = 2; round <= lastRound; round++) {
    const actual = new Map();
    for (const p of players) {
      const g = p.games.find((x) => x.round === round);
      if (g?.opponent != null && g.kind !== 'forfeit') actual.set(p.startNo, g.opponent);
    }
    if (actual.size === 0) continue;

    const predicted = new Map();
    for (const { white, black } of pairRound(players, round).games) {
      predicted.set(white, black);
      predicted.set(black, white);
    }

    let hits = 0;
    for (const [player, opponent] of actual) if (predicted.get(player) === opponent) hits++;
    rounds.push({ round, hits, total: actual.size });
  }
  return {
    rounds,
    hits: rounds.reduce((s, r) => s + r.hits, 0),
    total: rounds.reduce((s, r) => s + r.total, 0),
  };
}
