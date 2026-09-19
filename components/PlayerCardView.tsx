'use client';

import Link from 'next/link';
import type { CardRound, PlayerResponse } from '@/lib/client/types';
import { pad2, points, resultLabel, tidyName } from '@/lib/client/format';

/** Spec-sheet header ("LABEL" above "Value") plus one row per round. */
export function PlayerCardView({
  tournamentId,
  player,
  me,
  highlightOpponent,
}: {
  tournamentId: string;
  player: PlayerResponse;
  me?: number | null;
  highlightOpponent?: number | null;
}) {
  const { header, rounds } = player;
  let running = 0;
  const withScore = rounds.map((r) => {
    running += scoreOf(r.result);
    return { ...r, running };
  });

  return (
    <>
      <dl className="ef-spec">
        <Spec label="Points" value={points(header.points ?? running)} />
        <Spec label="Rank" value={header.rank ?? '–'} />
        <Spec label="Rating" value={header.rating || 'Unrated'} />
        <Spec label="Performance" value={header.performance || '–'} />
        {header.ratingChange != null && header.ratingChange !== 0 && (
          <Spec label="Rtg +/-" value={header.ratingChange > 0 ? `+${header.ratingChange}` : header.ratingChange} />
        )}
        {header.federation && <Spec label="Fed" value={header.federation} />}
        {header.club && <Spec label="Club" value={header.club} wide />}
      </dl>

      <ul className="ef-rows">
        {withScore.map((r) => (
          <RoundRow
            key={r.round}
            tournamentId={tournamentId}
            round={r}
            running={r.running}
            me={me}
            active={r.opponentNo != null && r.opponentNo === highlightOpponent}
          />
        ))}
      </ul>

      {header.fideId && (
        <p className="ef-help">
          <a className="ef-link" href={`https://ratings.fide.com/profile/${header.fideId}`} target="_blank" rel="noreferrer">
            FIDE profile {header.fideId} ↗
          </a>
        </p>
      )}
    </>
  );
}

function scoreOf(result: string | null): number {
  const r = String(result ?? '').trim();
  if (r === '1' || r === '+') return 1;
  if (r === '½' || r === '0.5' || r === '0,5') return 0.5;
  return 0;
}

function Spec({ label, value, wide = false }: { label: string; value: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`ef-spec__item${wide ? ' ef-spec__item--wide' : ''}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function RoundRow({
  tournamentId,
  round,
  running,
  me,
  active,
}: {
  tournamentId: string;
  round: CardRound;
  running: number;
  me?: number | null;
  active: boolean;
}) {
  const opponent = round.paired ? tidyName(round.opponent) : 'Bye / not paired';
  const href = round.opponentNo != null ? `/t/${tournamentId}/p/${round.opponentNo}${me ? `?me=${me}` : ''}` : null;
  const result = resultLabel(round.result);
  const cls = ['ef-row', active && 'ef-row--active', round.colour && `ef-row--tick-${round.colour}`]
    .filter(Boolean)
    .join(' ');

  return (
    <li className={cls}>
      <span className="ef-row__lead">R{pad2(round.round)}</span>
      <span className="ef-row__main">
        {href ? (
          <Link href={href} className="ef-rowlink">
            <strong>{opponent}</strong>
            <span className="ef-sub">
              {[round.rating || 'Unrated', round.federation, round.board != null ? `BD ${round.board}` : null]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </Link>
        ) : (
          <strong className="ef-muted">{opponent}</strong>
        )}
      </span>
      <span className="ef-row__trail">
        <span className={`ef-result ef-result--${result === '1' ? 'win' : result === '0' ? 'loss' : result ? 'draw' : 'none'}`}>
          {result || '·'}
        </span>
        <span className="ef-running">{points(running)}</span>
      </span>
    </li>
  );
}
