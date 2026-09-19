/**
 * "Who will I play next?" — combines the live crosstable with the pairing models.
 *
 *  - Round robin: the schedule decides; exact if the played rounds follow it.
 *  - Swiss: while the current round is still being played, sample every unfinished
 *    game from the players' ratings (Elo expectation with a draw share), pair the next
 *    round with the Dutch model, and count who you meet. Your own game can be fixed to
 *    win / draw / loss to see how each result changes the answer.
 */

import { pairRound, stateBefore, colourPreference, backtest } from './swiss.js';
import { bergerRound, followsBerger } from './roundrobin.js';

/** Small seeded PRNG so results are reproducible in tests. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DRAW_SHARE = 0.3;

/**
 * Expected result for white, split into win/draw/loss probabilities. Draws are most
 * likely between equals and fade out as the rating gap grows.
 */
export function outcomeOdds(whiteRating, blackRating) {
  const expected = 1 / (1 + 10 ** ((blackRating - whiteRating) / 400));
  const draw = DRAW_SHARE * (1 - Math.abs(2 * expected - 1));
  return {
    win: Math.max(0, expected - draw / 2),
    draw,
    loss: Math.max(0, 1 - expected - draw / 2),
  };
}

/** Format from the page, or inferred: a crosstable that follows Berger is a round robin. */
export function detectFormat(crosstable, details = {}) {
  if (details.format === 'swiss' || details.format === 'round-robin') return details.format;
  return followsBerger(crosstable.players, crosstable.rounds) ? 'round-robin' : 'swiss';
}

/**
 * @param {{rounds:number, players:Array}} crosstable  parsed art=5 crosstable
 * @param {object} options
 * @param {number} options.me                start number to forecast for
 * @param {'auto'|'win'|'draw'|'loss'} [options.scenario]
 * @param {number} [options.totalRounds]
 * @param {'swiss'|'round-robin'} [options.format]
 * @param {number} [options.runs]
 * @param {() => number} [options.random]
 */
export function forecast(crosstable, options) {
  const { me, scenario = 'auto', totalRounds = null, runs = 600, random = Math.random } = options;
  const format = options.format ?? detectFormat(crosstable);
  const { players } = crosstable;
  const current = crosstable.rounds;
  const target = current + 1;
  const byNo = new Map(players.map((p) => [p.startNo, p]));
  const mine = byNo.get(me);

  const base = { targetRound: target, format, candidates: [], byeProbability: 0, whiteProbability: null };
  if (!mine) return { ...base, status: 'not-in-event' };
  if (totalRounds && target > totalRounds) return { ...base, status: 'finished' };

  // ---- Round robin: read it off the schedule --------------------------------
  if (format === 'round-robin') {
    const trusted = followsBerger(players, current);
    const game = bergerRound(players.length, target).find((g) => g.white === me || g.black === me);
    const opponent = game ? (game.white === me ? game.black : game.white) : null;
    if (!game || !byNo.has(opponent)) {
      return { ...base, status: trusted ? 'schedule' : 'unknown', byeProbability: 1 };
    }
    return {
      ...base,
      status: trusted ? 'schedule' : 'unknown',
      whiteProbability: game.white === me ? 1 : 0,
      candidates: [candidate(byNo.get(opponent), 1, game.white === me ? 1 : 0, [])],
    };
  }

  // ---- Swiss: simulate the unfinished games ----------------------------------
  const round = current;
  const pending = [];
  let finishedBoards = 0;
  let boards = 0;
  for (const p of players) {
    const g = p.games.find((x) => x.round === round);
    if (!g || g.opponent == null || g.colour !== 'white') continue;
    boards++;
    if (g.kind === 'pending') pending.push({ white: p.startNo, black: g.opponent });
    else finishedBoards++;
  }

  const myGame = mine.games.find((g) => g.round === round);
  const myPending = myGame?.kind === 'pending';
  const fixedMine = myPending && scenario !== 'auto' ? { win: 1, draw: 0.5, loss: 0 }[scenario] : null;

  const rated = players.map((p) => p.rating).filter(Boolean);
  const fallback = rated.length ? Math.min(...rated) - 100 : 1200;
  const rating = (no) => byNo.get(no)?.rating || fallback;

  // Score before the current round, to measure score gaps inside each run.
  const scoreBefore = new Map(
    players.map((p) => [p.startNo, p.games.filter((g) => g.round < round).reduce((s, g) => s + (g.score ?? 0), 0)]),
  );
  const roundScore = (no, overrides) =>
    overrides.get(`${no}:${round}`) ?? byNo.get(no).games.find((g) => g.round === round)?.score ?? 0;
  const projected = (no, overrides) => scoreBefore.get(no) + roundScore(no, overrides);

  const n = pending.length === 0 ? 1 : runs;
  const opponents = new Map();
  let whites = 0;
  let byes = 0;

  for (let i = 0; i < n; i++) {
    const overrides = new Map();
    for (const { white, black } of pending) {
      let score;
      if (fixedMine != null && (white === me || black === me)) {
        score = white === me ? fixedMine : 1 - fixedMine;
      } else {
        const odds = outcomeOdds(rating(white), rating(black));
        const roll = random();
        score = roll < odds.win ? 1 : roll < odds.win + odds.draw ? 0.5 : 0;
      }
      overrides.set(`${white}:${round}`, score);
      overrides.set(`${black}:${round}`, 1 - score);
    }

    const { games, bye } = pairRound(players, target, overrides);
    if (bye === me) {
      byes++;
      continue;
    }
    const game = games.find((g) => g.white === me || g.black === me);
    if (!game) continue;
    const opponent = game.white === me ? game.black : game.white;
    const entry = opponents.get(opponent) ?? { count: 0, white: 0, gap: 0 };
    entry.count++;
    entry.gap += projected(opponent, overrides) - projected(me, overrides);
    if (game.white === me) {
      entry.white++;
      whites++;
    }
    opponents.set(opponent, entry);
  }

  // Colours don't depend on results, so the preference is the same in every run.
  const myPref = colourPreference(stateBefore(players, target).find((s) => s.startNo === me).colours);

  const candidates = [...opponents.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[0] - b[0])
    .slice(0, 5)
    .map(([no, { count, white, gap: gapSum }]) => {
      const reasons = [];
      const gap = Math.round((gapSum / count) * 2) / 2; // typical gap, to the half point
      reasons.push(gap === 0 ? 'SAME SCORE GROUP' : `${gap > 0 ? '+' : ''}${gap} PTS`);
      reasons.push('NOT MET');
      if (myPref.colour) reasons.push(`YOU DUE ${myPref.colour.toUpperCase()}`);
      return candidate(byNo.get(no), count / n, white / count, reasons);
    });

  return {
    ...base,
    status: pending.length === 0 ? 'determined' : 'simulated',
    runs: n,
    boards,
    finishedBoards,
    myGamePending: myPending,
    byeProbability: byes / n,
    whiteProbability: n - byes > 0 ? whites / (n - byes) : null,
    candidates,
  };
}

function candidate(player, probability, whiteProbability, reasons) {
  return {
    startNo: player.startNo,
    name: player.name,
    title: player.title,
    rating: player.rating,
    federation: player.federation,
    points: player.points,
    probability,
    whiteProbability,
    reasons,
  };
}

/**
 * How well the Swiss model reproduced this event's own earlier rounds: the share of
 * players whose predicted opponent was the real one. Rounds with any unfinished game
 * are excluded, since their pairing inputs weren't final.
 */
export function trackRecord(crosstable) {
  const complete = (round) =>
    crosstable.players.every((p) => p.games.find((g) => g.round === round)?.kind !== 'pending');
  let last = crosstable.rounds;
  while (last > 1 && !complete(last - 1)) last--;
  return backtest(crosstable.players, last);
}
