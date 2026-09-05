#!/usr/bin/env node
/**
 * Fast-polling loop for "instant" alerts.
 *
 * poll.js is designed to run once every ~10 minutes via cron, which is where most of
 * the latency in this project comes from — GitHub's scheduled workflows have a
 * 5-minute floor and are routinely delayed further. This script instead runs *inside
 * one long workflow job* and loops with a short sleep, so the only latency left is
 * the interval below. It is started by a person tapping "Start watching" in the PWA
 * (or the Actions UI), not by cron.
 *
 * Each tick just re-runs poll.js as a subprocess — that keeps the fast path and the
 * slow (cron) path sharing the exact same tested logic instead of forking it.
 *
 *   node scripts/watch.js --minutes 340 --interval 20
 */

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function arg(flag, fallback) {
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? Number(process.argv[index + 1]) : fallback;
}

const BUDGET_MS = arg('--minutes', 340) * 60_000; // default 5h40m, under the 6h hosted-runner cap
const INTERVAL_MS = Math.max(5, arg('--interval', 20)) * 1000; // floor at 5s: be a good citizen

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function run(command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit' });
  return result.status === 0;
}

/** Commit and push data/ only if the poll actually changed something. */
function commitIfChanged() {
  const status = spawnSync('git', ['status', '--porcelain', '--', 'data/'], { cwd: ROOT });
  if (!status.stdout?.toString().trim()) return; // nothing changed this tick

  run('git', ['add', 'data/']);
  const diff = spawnSync('git', ['diff', '--cached', '--quiet', '--', 'data/'], { cwd: ROOT });
  if (diff.status === 0) return; // staged but identical (shouldn't happen, but be safe)

  run('git', ['commit', '-m', 'data: refresh pairings (fast watch)']);

  for (let attempt = 1; attempt <= 3; attempt++) {
    const branch = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: ROOT })
      .stdout.toString()
      .trim();
    run('git', ['pull', '--rebase', '--autostash', 'origin', branch]);
    if (run('git', ['push', 'origin', `HEAD:${branch}`])) return;
    console.warn(`  push attempt ${attempt} failed; retrying`);
  }
  console.error('! Could not push data/ after 3 attempts — a notification may have gone out without the app reflecting it yet.');
}

async function main() {
  const startedAt = Date.now();
  let tick = 0;

  console.log(
    `Fast watch starting: interval ${INTERVAL_MS / 1000}s, budget ${BUDGET_MS / 60_000} min.`,
  );

  while (Date.now() - startedAt < BUDGET_MS) {
    tick += 1;
    const elapsedMin = Math.round((Date.now() - startedAt) / 60_000);
    console.log(`\n--- tick ${tick} (t+${elapsedMin}m) ---`);

    const ok = run('node', ['scripts/poll.js']);
    if (!ok) console.warn('  poll.js exited non-zero this tick — will try again next tick.');
    commitIfChanged();

    const remaining = BUDGET_MS - (Date.now() - startedAt);
    if (remaining <= 0) break;
    await sleep(Math.min(INTERVAL_MS, remaining));
  }

  console.log('\nBudget exhausted for this link. The workflow will chain to the next one.');
}

main();
