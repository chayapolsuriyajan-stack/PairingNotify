'use client';

import Link from '@/components/NavLink';
import type { CardRound, PlayerResponse } from '@/lib/client/types';
import { pad2, points, resultLabel, tidyName } from '@/lib/client/format';
import { Decode, ScanLine } from './Motion';
import { ratingChanges } from '@/lib/rating.js';

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
  const rating = ratingChanges(rounds, {
    rating: header.ratingInternational || header.rating || null,
    official: header.ratingChange ?? null,
  });
  const changeOf = new Map(rating?.games.map((g) => [g.round, g.change]) ?? []);
  const showRating = rating && rating.games.length > 0;

  return (
    <>
      <dl className="ef-spec">
        <Spec label="Points" value={points(header.points ?? running)} />
        <Spec label="Rank" value={header.rank ?? '–'} />
        <Spec label="Rating" value={header.rating || 'Unrated'} />
        <Spec label="Performance" value={header.performance || '–'} />
        {showRating && (
          <Spec
            label={rating.kFrom === 'official' ? 'FIDE rtg +/-' : `Rtg +/- · K${rating.k}`}
            value={`${rating.kFrom === 'official' ? '' : '≈'}${signed(rating.total)}`}
          />
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
            ratingChange={changeOf.get(r.round) ?? null}
            me={me}
            active={r.opponentNo != null && r.opponentNo === highlightOpponent}
          />
        ))}
      </ul>

      {showRating && rating.kFrom !== 'official' && (
        <p className="ef-help">
          Rating changes are estimated with K = {rating.k} (FIDE&apos;s usual value at this rating). Juniors and new
          players use K = 40; the official figure replaces this once chess-results publishes it.
        </p>
      )}

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

const signed = (n: number) => (n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1));

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
  ratingChange,
  me,
  active,
}: {
  tournamentId: string;
  round: CardRound;
  running: number;
  ratingChange: number | null;
  me?: number | null;
  active: boolean;
}) {
  const opponent = round.paired ? tidyName(round.opponent) : 'Bye / not paired';
  const href = round.opponentNo != null ? `/t/${tournamentId}/p/${round.opponentNo}${me ? `?me=${me}` : ''}` : null;
  const result = resultLabel(round.result);
  const cls = ['ef-row', 'ef-scan-host', active && 'ef-row--active', round.colour && `ef-row--tick-${round.colour}`]
    .filter(Boolean)
    .join(' ');

  return (
    <li className={cls}>
      <ScanLine value={round.result} />
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
          <Decode text={result || '·'} decodeOnChange />
        </span>
        <span className="ef-running">{points(running)}</span>
        {ratingChange != null && (
          <span className={`ef-rtgdelta ef-rtgdelta--${ratingChange > 0 ? 'up' : ratingChange < 0 ? 'down' : 'even'}`}>
            {signed(ratingChange)}
          </span>
        )}
      </span>
    </li>
  );
}
