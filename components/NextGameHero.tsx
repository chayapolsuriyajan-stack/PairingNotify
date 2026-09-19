'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { FeedTournament } from '@/lib/client/types';
import { countdown, hhmm, pad2, resultLabel, tidyName } from '@/lib/client/format';
import { Scramble } from './Scramble';
import { Changed, ScanLine } from './Motion';

/**
 * The first thing you see: where you sit, who you play, which colour. Board number,
 * colour and opponent must be readable in under a second (design.md guardrail 1), so
 * decoration stays behind or beside them.
 */
export function NextGameHero({
  tournament,
  start,
  isNew,
  label = 'Your next game',
}: {
  tournament: FeedTournament;
  start: Date | null;
  isNew: boolean;
  label?: string;
}) {
  const game = tournament.latestPaired;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  if (!game) {
    return (
      <section className="ef-hero ef-hero--empty">
        <p className="ef-hero__kicker">{label}</p>
        <p className="ef-hero__waiting">Waiting for round 1 pairings</p>
        <p className="ef-hero__event">{tournament.title}</p>
      </section>
    );
  }

  const done = Boolean(game.result);
  const minutesToStart = start ? (start.getTime() - now) / 60_000 : null;
  const urgent = !done && minutesToStart != null && minutesToStart > 0 && minutesToStart <= 10;
  const colour = game.colour;
  const meta = [`RD ${pad2(game.round)}`, game.board != null ? `BD ${game.board}` : null, start ? hhmm(start) : null]
    .filter(Boolean)
    .join(' │ ');

  return (
    <section className={`ef-hero${isNew ? ' ef-hero--new' : ''}`} aria-label={label}>
      <ScanLine value={`${game.round}:${game.board}:${game.opponent}:${game.colour}:${game.result}`} />
      <div className="ef-hero__watermark" aria-hidden="true">
        {pad2(game.round)}
      </div>

      <div className="ef-hero__head">
        <p className="ef-hero__kicker">{done ? `Round ${game.round} · finished` : label}</p>
        <p className="ef-hero__meta">{meta}</p>
      </div>

      <div className="ef-hero__grid">
        <div className="ef-hero__board">
          <span className="ef-hero__label">Board</span>
          <span className="ef-hero__num">
            <Scramble text={game.board != null ? String(game.board) : '–'} active={isNew} />
          </span>
        </div>
        <div className={`ef-hero__colour ef-hero__colour--${colour ?? 'unknown'}`}>
          <span className="ef-hero__label">You play</span>
          <span className="ef-hero__colourname">{colour ?? '?'}</span>
        </div>
      </div>

      <div className="ef-hero__opp">
        <span className="ef-hero__label">Opponent</span>
        <p className="ef-hero__name">
          <Changed value={game.opponent}>{tidyName(game.opponent)}</Changed>
        </p>
        <p className="ef-hero__facts">
          {[game.rating ? String(game.rating) : 'Unrated', game.federation].filter(Boolean).join(' · ')}
        </p>
      </div>

      <div className="ef-hero__foot">
        <p className={`ef-hero__status${urgent ? ' ef-hero__status--urgent' : ''}`}>
          {done
            ? `RESULT ${resultLabel(game.result)} · WAITING FOR RD ${game.round + 1}`
            : start
              ? countdown(start, now)
              : 'PAIRING PUBLISHED'}
        </p>
        {game.opponentNo != null && (
          <Link className="ef-link" href={`/t/${tournament.id}/p/${game.opponentNo}?me=${tournament.startNo}`}>
            Scout opponent ▶
          </Link>
        )}
      </div>

      <p className="ef-hero__event">
        <Link href={`/t/${tournament.id}?p=${tournament.startNo}`}>{tournament.title}</Link>
      </p>
    </section>
  );
}
