/**
 * The words on a result alert: "RD 5 · WIN vs Novák, Šimon" and one line underneath,
 * chosen to match how the game went. Three styles (lib/settings.js): short lines,
 * famous players' quotes, or the account's own text.
 *
 * The quotes are short, widely published and commonly attributed to the player named;
 * like most chess sayings, some attributions are traditional rather than documented.
 */

import { fullName } from './notify.js';

export const LINES = {
  win: ["Let's note that down.", 'Clean finish. Full point banked.', 'That one goes on the fridge.', 'Nicely played: a full point.'],
  draw: ["That's a close call.", 'Half a point banked.', 'Honours even. On to the next one.', 'Shared the point. Reset for the next round.'],
  loss: ['Shake it off. Next round.', 'Tough one. Reset and go again.', "Let's note that down, and learn from it.", 'Breathe, eat something, come back sharper.'],
};

export const QUOTES = {
  win: [
    ['When you see a good move, look for a better one.', 'Emanuel Lasker'],
    ["I don't believe in psychology. I believe in good moves.", 'Bobby Fischer'],
    ['There are two types of sacrifices: correct ones, and mine.', 'Mikhail Tal'],
    ['The winner of the game is the player who makes the next-to-last mistake.', 'Savielly Tartakower'],
  ],
  draw: [
    ['The threat is stronger than the execution.', 'Aron Nimzowitsch'],
    ['A good player is always lucky.', 'José Raúl Capablanca'],
    [
      'Tactics is knowing what to do when there is something to do; strategy is knowing what to do when there is nothing to do.',
      'Savielly Tartakower',
    ],
    ['Chess is mental torture.', 'Garry Kasparov'],
  ],
  loss: [
    ['You may learn much more from a game you lose than from a game you win.', 'José Raúl Capablanca'],
    ['No one ever won a game by resigning.', 'Savielly Tartakower'],
    ['The winner of the game is the player who makes the next-to-last mistake.', 'Savielly Tartakower'],
    ['Chess is mental torture.', 'Garry Kasparov'],
  ],
};

/**
 * A card's result cell, from the card owner's side. Forfeits ("+", "-", "1K") are not
 * games anyone played, so they get no message.
 * @returns {'win'|'draw'|'loss'|null}
 */
export function outcomeOf(result) {
  const t = String(result ?? '').trim().replace(',', '.');
  if (t === '1') return 'win';
  if (t === '0') return 'loss';
  if (t === '½' || t === '0.5' || t === '1/2') return 'draw';
  return null;
}

/** Same game, same line: a re-sent alert must not change its words. */
function pick(list, seed) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return list[h % list.length];
}

export function resultLine(outcome, settings, seed) {
  const { style, custom } = settings.results;
  if (style === 'custom' && custom[outcome]) return custom[outcome];
  if (style === 'quotes') {
    const [quote, who] = pick(QUOTES[outcome], seed);
    return `“${quote}” — ${who}`;
  }
  return pick(LINES[outcome], seed);
}

/**
 * @param {object} item      a newResults entry from diff.js (round fields + player)
 * @param {object} settings  normalised settings
 * @returns {object|null}    push payload, or null when this outcome is switched off
 */
export function buildResultNotification(item, settings) {
  const outcome = outcomeOf(item.result);
  if (!outcome || !settings.results[outcome]) return null;
  if (item.isMe === false && !settings.results.followed) return null;

  const who = item.isMe === false && item.playerName ? `${fullName(item.playerName)} · ` : '';
  const opponent = item.opponent ? ` vs ${fullName(item.opponent)}` : '';
  return {
    title: `${who}RD ${item.round} · ${outcome.toUpperCase()}${opponent}`,
    body: resultLine(outcome, settings, `${item.tournamentId}:${item.startNo}:${item.round}`),
    tag: `${item.tournamentId}-${item.startNo ?? ''}-r${item.round}-result`,
    url: item.startNo != null ? `/t/${item.tournamentId}?p=${item.startNo}` : `/t/${item.tournamentId}`,
    tournament: item.tournamentTitle ?? null,
    round: item.round,
  };
}
