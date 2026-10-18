#!/usr/bin/env node
/**
 * How good is the next-opponent forecast? Replays finished events round by round.
 *
 *   npm run bench                         events in scripts/bench-events.json
 *   npm run bench -- --ids 1499564,1486488
 *   npm run bench -- --discover "Smith,Kumar,Nguyen" --save   find events, add them to the corpus
 *   npm run bench -- --json bench.json    also write the numbers, to diff before/after a change
 *
 * For every round R >= 2 of a finished Swiss event, with only rounds before R known:
 *   exact   share of players whose opponent the pairer predicted exactly
 *   colour  of those exact hits, share with the right colour
 *   top1/3  the Monte Carlo forecast, made as if round R-1 were still being played
 *           (its results hidden), has the real opponent first / in its top 3
 *   top3+me the same, once your own round R-1 game is over (the rest still hidden)
 *   bye     the predicted bye was the real bye
 *
 * Crosstables are downloaded once (politely, through lib/chessresults/client.js) and
 * kept in .cache/bench/, so re-running after a model change costs chess-results nothing.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchHtml, tournamentUrl } from '../lib/chessresults/client.js';
import { parseCrosstable, parseDetails } from '../lib/chessresults/pages.js';
import { searchPlayers } from '../lib/chessresults/search.js';
import { pairRound } from '../lib/predict/swiss.js';
import { detectFormat, forecast, mulberry32 } from '../lib/predict/forecast.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, '.cache', 'bench');
const CORPUS = join(ROOT, 'scripts', 'bench-events.json');

const arg = (flag) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? (process.argv[i + 1] ?? true) : null;
};
const flag = (name) => process.argv.includes(name);
const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : '—');

async function crosstable(id) {
  const file = join(CACHE, `${id}.html`);
  let html;
  if (existsSync(file)) html = await readFile(file, 'utf8');
  else {
    html = await fetchHtml(tournamentUrl(id, { lan: '1', art: '5', flag: '30', zeilen: '99999' }));
    await mkdir(CACHE, { recursive: true });
    await writeFile(file, html, 'utf8');
  }
  return { ...parseCrosstable(html), details: parseDetails(html) };
}

/** Every game of round `round` hidden, as while it is still being played. */
function maskRound(players, round) {
  return players.map((p) => ({
    ...p,
    games: p.games
      .filter((g) => g.round <= round)
      .map((g) => (g.round === round && g.kind === 'game' ? { ...g, kind: 'pending', score: null } : g)),
  }));
}

const complete = (players, round) => players.every((p) => p.games.find((g) => g.round === round)?.kind !== 'pending');

/**
 * @param {{rounds:number, players:Array}} cross
 * @param {{sample:number, runs:number}} options  how many players get a Monte Carlo forecast per round
 */
export function benchmarkEvent(cross, { sample = 8, runs = 150 } = {}) {
  const totals = {
    exact: 0, pairs: 0, colourHit: 0, colourOf: 0, top1: 0, top3: 0, forecasts: 0,
    ownTop3: 0, ownOf: 0, bye: 0, byeOf: 0, rounds: 0,
  };
  const random = mulberry32(42);

  for (let round = 2; round <= cross.rounds; round++) {
    if (!complete(cross.players, round) || !complete(cross.players, round - 1)) continue;
    const actual = new Map();
    let realBye = null;
    for (const p of cross.players) {
      const g = p.games.find((x) => x.round === round);
      if (g?.opponent != null && g.kind !== 'forfeit') actual.set(p.startNo, { opponent: g.opponent, colour: g.colour });
      if (g?.kind === 'bye' && g.score === 1) realBye = p.startNo; // a pairing-allocated bye scores a full point
    }
    if (actual.size === 0) continue;
    totals.rounds++;

    const { games, bye } = pairRound(cross.players, round);
    const predicted = new Map();
    for (const { white, black } of games) {
      predicted.set(white, { opponent: black, colour: 'white' });
      predicted.set(black, { opponent: white, colour: 'black' });
    }
    for (const [no, real] of actual) {
      totals.pairs++;
      const guess = predicted.get(no);
      if (guess?.opponent === real.opponent) {
        totals.exact++;
        totals.colourOf++;
        if (guess.colour === real.colour) totals.colourHit++;
      }
    }
    if (realBye != null) {
      totals.byeOf++;
      if (bye === realBye) totals.bye++;
    }

    // Monte Carlo from mid-round R-1, for an evenly spread sample of players.
    const masked = { rounds: round - 1, players: maskRound(cross.players, round - 1) };
    const nos = [...actual.keys()].sort((a, b) => a - b);
    const step = Math.max(1, Math.floor(nos.length / sample));
    for (let i = 0; i < nos.length; i += step) {
      const me = nos[i];
      const result = forecast(masked, { me, runs, random, format: 'swiss' });
      if (!result.candidates?.length) continue;
      totals.forecasts++;
      const real = actual.get(me).opponent;
      if (result.candidates[0].startNo === real) totals.top1++;
      if (result.candidates.slice(0, 3).some((c) => c.startNo === real)) totals.top3++;

      // The usual case in a hall: your own game is over, the others are still playing.
      const mine = cross.players.find((p) => p.startNo === me)?.games.find((g) => g.round === round - 1);
      if (mine?.kind !== 'game') continue;
      const known = new Set([me, mine.opponent]);
      const ownKnown = {
        rounds: round - 1,
        players: masked.players.map((p) =>
          known.has(p.startNo) ? { ...p, games: cross.players.find((q) => q.startNo === p.startNo).games.filter((g) => g.round <= round - 1) } : p,
        ),
      };
      const after = forecast(ownKnown, { me, runs, random, format: 'swiss' });
      totals.ownOf++;
      if (after.candidates?.slice(0, 3).some((c) => c.startNo === real)) totals.ownTop3++;
    }
  }
  return totals;
}

function add(a, b) {
  for (const k of Object.keys(b)) a[k] = (a[k] ?? 0) + b[k];
  return a;
}

const row = (label, t) =>
  [
    label.padEnd(34).slice(0, 34),
    String(t.rounds).padStart(3),
    pct(t.exact, t.pairs).padStart(7),
    pct(t.colourHit, t.colourOf).padStart(7),
    pct(t.top1, t.forecasts).padStart(7),
    pct(t.top3, t.forecasts).padStart(7),
    pct(t.ownTop3, t.ownOf).padStart(7),
    pct(t.bye, t.byeOf).padStart(7),
  ].join('  ');

async function discover(names) {
  const ids = new Set();
  for (const query of names) {
    try {
      const players = await searchPlayers({ query, recentDays: 120, limit: 12 });
      for (const p of players) for (const t of p.tournaments) if ((t.rounds ?? 0) >= 5) ids.add(String(t.id));
    } catch (error) {
      console.error(`search "${query}": ${error.message}`);
    }
  }
  return [...ids];
}

async function main() {
  let ids;
  if (arg('--ids')) ids = String(arg('--ids')).split(',').map((s) => s.trim()).filter(Boolean);
  else if (arg('--discover')) ids = await discover(String(arg('--discover')).split(','));
  else ids = JSON.parse(await readFile(CORPUS, 'utf8')).events;

  const kept = [];
  const overall = {};
  const bySize = { 'small (<20)': {}, 'medium (20-59)': {}, 'large (60+)': {} };
  console.log(['event'.padEnd(34), 'rds', '  exact', ' colour', '   top1', '   top3', ' top3+me', '    bye'].join('  '));

  for (const id of ids) {
    let cross;
    try {
      cross = await crosstable(id);
    } catch (error) {
      console.error(`${id}: ${error.message}`);
      continue;
    }
    if (detectFormat(cross, cross.details) !== 'swiss' || cross.rounds < 3) continue;
    const t = benchmarkEvent(cross);
    if (!t.rounds) continue;
    kept.push(id);
    add(overall, t);
    const n = cross.players.length;
    add(bySize[n < 20 ? 'small (<20)' : n < 60 ? 'medium (20-59)' : 'large (60+)'], t);
    console.log(row(`${id} · ${n} players`, t));
  }

  console.log('-'.repeat(84));
  for (const [label, t] of Object.entries(bySize)) if (t.rounds) console.log(row(label, t));
  console.log(row(`ALL ${kept.length} events`, overall));

  if (flag('--save') && kept.length) {
    const existing = existsSync(CORPUS) ? JSON.parse(await readFile(CORPUS, 'utf8')).events : [];
    const events = [...new Set([...existing, ...kept])];
    await writeFile(CORPUS, `${JSON.stringify({ events }, null, 2)}\n`);
    console.log(`corpus: ${events.length} events in scripts/bench-events.json`);
  }
  if (arg('--json')) {
    await writeFile(String(arg('--json')), JSON.stringify({ overall, bySize, events: kept }, null, 2));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
