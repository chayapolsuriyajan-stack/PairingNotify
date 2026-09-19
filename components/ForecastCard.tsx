'use client';

import Link from '@/components/NavLink';
import { useEffect, useMemo, useState } from 'react';
import type { Overview } from '@/lib/client/types';
import { forecast, trackRecord } from '@/lib/predict/forecast.js';
import { percent, tidyName } from '@/lib/client/format';
import { Segmented } from './Segmented';
import { Chip } from './ui';
import { CountUp, Loading } from './Motion';

type Scenario = 'auto' | 'win' | 'draw' | 'loss';

interface Candidate {
  startNo: number;
  name: string;
  title: string | null;
  rating: number | null;
  probability: number;
  whiteProbability: number;
  reasons: string[];
}

interface Forecast {
  status: 'simulated' | 'determined' | 'schedule' | 'unknown' | 'finished' | 'not-in-event';
  targetRound: number;
  format: 'swiss' | 'round-robin';
  candidates: Candidate[];
  byeProbability: number;
  whiteProbability: number | null;
  boards?: number;
  finishedBoards?: number;
  myGamePending?: boolean;
  dueColour?: 'white' | 'black' | null;
}

/**
 * NEXT ROUND FORECAST (plan §3a). Always labelled as a prediction, shows probabilities
 * rather than one answer, and says how well the model did on this event's own earlier
 * rounds so you know how far to trust it.
 */
export function ForecastCard({ overview, me, compact = false }: { overview: Overview; me: number; compact?: boolean }) {
  const [scenario, setScenario] = useState<Scenario>('auto');
  const [result, setResult] = useState<Forecast | null>(null);

  // Run after paint: a few hundred simulated rounds takes tens of milliseconds. The
  // previous result stays on screen meanwhile, so switching scenario doesn't blank the
  // card (and the WIN/DRAW/LOSS ink can slide instead of remounting).
  useEffect(() => {
    const timer = setTimeout(() => {
      setResult(
        forecast(overview, {
          me,
          scenario,
          totalRounds: overview.totalRounds ?? undefined,
          format: overview.format ?? undefined,
          runs: compact ? 300 : 600,
        }) as Forecast,
      );
    }, 0);
    return () => clearTimeout(timer);
  }, [overview, me, scenario, compact]);

  const record = useMemo(
    () => (overview.format === 'swiss' && overview.rounds >= 2 ? trackRecord(overview) : null),
    [overview],
  );

  if (!overview.started) return null;
  if (result && (result.status === 'finished' || result.status === 'not-in-event')) return null;

  const scheduled = result?.status === 'schedule';
  const shown = result?.candidates.slice(0, compact ? 3 : 5) ?? [];

  return (
    <section className="ef-panel ef-forecast" aria-busy={!result}>
      <header className="ef-panel__head">
        <div>
          <p className="ef-panel__code" aria-hidden="true">
            04 / FORECAST
          </p>
          <h3 className="ef-panel__title">Round {overview.rounds + 1} opponent</h3>
        </div>
        <Chip tone={scheduled ? 'ok' : 'info'}>{scheduled ? 'By schedule' : 'Prediction'}</Chip>
      </header>

      <div className="ef-panel__body">
        {result?.myGamePending && !scheduled && (
          <Segmented<Scenario>
            label="Assume your result"
            value={scenario}
            onChange={setScenario}
            options={[
              { value: 'auto', label: 'Any' },
              { value: 'win', label: 'If I win' },
              { value: 'draw', label: 'Draw' },
              { value: 'loss', label: 'Loss' },
            ]}
          />
        )}

        {!result && <Loading label="Simulating the rest of the round" />}

        {result && shown.length === 0 && (
          <p className="ef-help">
            {result.byeProbability > 0.5 ? 'You are likely to get the bye.' : 'No prediction for this round.'}
          </p>
        )}

        {shown.length > 0 && (
          <ul className="ef-rows ef-forecast__list">
            {shown.map((c) => (
              <li key={c.startNo} className="ef-row ef-forecast__row">
                <div className="ef-forecast__main">
                  <Link href={`/t/${overview.id}/p/${c.startNo}?me=${me}`} className="ef-forecast__name">
                    {c.title ? <span className="ef-title">{c.title}</span> : null}
                    {tidyName(c.name)}
                  </Link>
                  <span className="ef-forecast__facts">
                    {c.rating ?? 'Unrated'} · {c.whiteProbability >= 0.5 ? 'YOU WHITE' : 'YOU BLACK'}
                  </span>
                  {!compact && c.reasons.length > 0 && (
                    <span className="ef-forecast__why">{c.reasons.join(' · ')}</span>
                  )}
                  <Bar value={c.probability} />
                </div>
                <span className="ef-row__trail">
                  {c.probability > 0 && c.probability < 0.01 ? (
                    percent(c.probability)
                  ) : (
                    <CountUp value={c.probability * 100} format={(n) => `${Math.round(n)}%`} />
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        {result && (
          <p className="ef-forecast__basis">
            {scheduled
              ? 'ROUND ROBIN · FROM THE PAIRING TABLE'
              : result.status === 'simulated'
                ? `BASED ON ${result.finishedBoards}/${result.boards} BOARDS FINISHED`
                : 'ALL RESULTS IN'}
            {result.dueColour ? ` · YOU'RE DUE ${result.dueColour.toUpperCase()}` : ''}
            {result.byeProbability > 0.02 ? ` · BYE ${percent(result.byeProbability)}` : ''}
          </p>
        )}

        {record && record.total > 0 && (
          <p className="ef-forecast__record">
            Model got {percent(record.hits / record.total)} of this event&apos;s earlier pairings exactly right.
          </p>
        )}

        {compact && (
          <Link className="ef-link" href={`/t/${overview.id}/next?p=${me}`}>
            Full forecast ▶
          </Link>
        )}
        {!compact && (
          <p className="ef-help">
            Real events are paired by the arbiter&apos;s software (FIDE Dutch system) plus late entries, withdrawals and
            requested byes nobody announces in advance. Treat this as odds, not a promise.
          </p>
        )}
      </div>
    </section>
  );
}

/** Segmented probability bar: 10 blocks (design.md: discrete, not smooth). */
function Bar({ value }: { value: number }) {
  const lit = Math.round(value * 10);
  return (
    <span className="ef-bar" aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => (
        <span
          key={i}
          className={`ef-bar__seg${i < lit ? ' ef-bar__seg--on' : ''}`}
          style={{ '--i': i } as React.CSSProperties}
        />
      ))}
    </span>
  );
}
