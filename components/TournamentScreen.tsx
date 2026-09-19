'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Overview, Pairing, PlayerResponse, StandingRow } from '@/lib/client/types';
import { countdown, nameKey, points, roundStart, syncLabel, tidyName } from '@/lib/client/format';
import { Chip, HazardBanner, Panel } from './ui';
import { Segmented } from './Segmented';
import { SyncReadout, TopBar } from './TopBar';
import { PlayerCardView } from './PlayerCardView';
import { ForecastCard } from './ForecastCard';
import { useJson } from './useJson';
import { useAccount } from './useAccount';
import { Changed, Loading } from './Motion';

type Tab = 'pairings' | 'standings' | 'card' | 'info';

/**
 * One tournament, the way chess-results should look on a phone: the round's pairings
 * with your board on top, standings with your row pinned, your card, and the details.
 */
export function TournamentScreen({ id, p, tab: initialTab }: { id: string; p: number | null; tab: Tab | null }) {
  const overview = useJson<Overview>(`/api/cr/${id}/overview`, { refreshMs: 60_000 });
  const { feed } = useAccount({ refreshMs: 0 });

  // Whose view is this? ?p= wins, else a followed player in this event (you first).
  const followed = (feed.data?.feed.follows ?? [])
    .flatMap((f) => f.tournaments.filter((t) => t.id === id).map((t) => ({ isMe: f.isMe, startNo: t.startNo })))
    .sort((a, b) => Number(b.isMe) - Number(a.isMe));
  const me = p ?? followed[0]?.startNo ?? null;

  const [tab, setTab] = useState<Tab>(initialTab ?? 'pairings');
  const menu = overview.data?.menu;
  const latestRound = menu?.currentRound ?? overview.data?.rounds ?? null;
  const [round, setRound] = useState<number | null>(null);
  const shownRound = round ?? latestRound;
  // Standings lag pairings: the ranking after round N appears once N is played.
  const standingsRounds = menu?.standingsRounds ?? [];
  const standingsRound = standingsRounds.length ? Math.min(shownRound ?? Infinity, lastOf(standingsRounds)!) : null;

  // Keep the URL shareable without adding history entries.
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    if (me) url.searchParams.set('p', String(me));
    window.history.replaceState(null, '', url);
  }, [tab, me]);

  const data = overview.data;
  const mePlayer = data?.players.find((x) => x.startNo === me) ?? null;
  const start = roundStart(data?.schedule, latestRound);
  const total = data?.totalRounds ?? menu?.totalRounds ?? null;
  const live = data?.players.some((x) => x.games.some((g) => g.kind === 'pending'));

  return (
    <main className="ef-page">
      <TopBar
        caption={`EVENT ${id}`}
        title="Event"
        right={
          <SyncReadout
            label={syncLabel(overview.updatedAt)}
            offline={overview.offline}
            busy={overview.fetching}
            onRefresh={overview.reload}
          />
        }
      />

      {overview.loading && !data && <Loading label={`Reading event ${id}`} />}
      {overview.error && !data && (
        <HazardBanner label="Can't load this event">
          {overview.error}. Check the tournament id, or try again in a minute.
        </HazardBanner>
      )}

      {data && (
        <header className="ef-event">
          <h2 className="ef-event__title">{data.title ?? `Tournament ${id}`}</h2>
          <div className="ef-event__chips">
            {data.format && <Chip>{data.format === 'swiss' ? 'Swiss' : 'Round robin'}</Chip>}
            {latestRound != null && (
              <Chip tone="accent">
                Rd {latestRound}
                {total ? `/${total}` : ''}
              </Chip>
            )}
            {live && (
              <Chip tone="accent" solid pulse>
                Live
              </Chip>
            )}
            {!data.started && <Chip tone="info">Not started</Chip>}
            {start && live && <Chip tone="info">{countdown(start, Date.now())}</Chip>}
          </div>
          {mePlayer && (
            <p className="ef-event__me">
              {tidyName(mePlayer.name)} · #{mePlayer.startNo} · <Changed value={mePlayer.points}>{points(mePlayer.points)}</Changed> pts
              {mePlayer.rank ? ` · rank ${mePlayer.rank}` : ''}
            </p>
          )}
        </header>
      )}

      <Segmented<Tab>
        label="Event sections"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'pairings', label: 'Pairings' },
          { value: 'standings', label: 'Standings' },
          ...(me ? [{ value: 'card' as Tab, label: 'My card' }] : []),
          { value: 'info', label: 'Info' },
        ]}
      />

      {data && (tab === 'pairings' || tab === 'standings') && (
        <RoundPicker
          rounds={tab === 'pairings' ? (menu?.pairedRounds ?? range(data.rounds)) : standingsRounds}
          value={tab === 'standings' ? standingsRound : shownRound}
          onChange={setRound}
        />
      )}

      {tab === 'pairings' && shownRound != null && data?.started && <PairingsView id={id} round={shownRound} me={me} />}
      {tab === 'standings' && data?.started && (
        <StandingsView id={id} round={standingsRound} me={me} />
      )}
      {data && !data.started && (tab === 'pairings' || tab === 'standings') && <Entrants overview={data} me={me} />}
      {tab === 'card' && me && <CardView id={id} me={me} />}
      {tab === 'info' && data && <InfoView overview={data} />}

      {data?.started && me && tab === 'pairings' && <ForecastCard overview={data} me={me} compact />}
    </main>
  );
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
const lastOf = (xs: number[] | undefined) => (xs && xs.length ? xs[xs.length - 1] : null);

function RoundPicker({ rounds, value, onChange }: { rounds: number[]; value: number | null; onChange: (r: number) => void }) {
  if (rounds.length === 0 || value == null) return null;
  return (
    <Segmented<number>
      label="Round"
      scroll
      value={value}
      onChange={onChange}
      options={rounds.map((r) => ({ value: r, label: `R${r}` }))}
    />
  );
}

function Search({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      className="ef-input ef-search"
      type="search"
      inputMode="search"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={placeholder}
    />
  );
}

const matches = (query: string, ...names: (string | null | undefined)[]) => {
  const q = nameKey(query);
  if (!q) return true;
  return names.some((n) => nameKey(n).includes(q) || String(n ?? '').toLowerCase().includes(query.toLowerCase()));
};

function PairingsView({ id, round, me }: { id: string; round: number; me: number | null }) {
  const pairings = useJson<{ games: Pairing[] }>(`/api/cr/${id}/pairings?rd=${round}`, { refreshMs: 60_000 });
  const [query, setQuery] = useState('');
  const games = pairings.data?.games ?? [];
  const mine = me != null ? games.find((g) => g.white.startNo === me || g.black?.startNo === me) : undefined;
  const shown = games.filter((g) => matches(query, g.white.name, g.black?.name, String(g.board)));

  return (
    <>
      <Search value={query} onChange={setQuery} placeholder="Find a player or board" />
      {pairings.error && !pairings.data && <p className="ef-error">{pairings.error}</p>}
      {pairings.loading && !pairings.data && <Loading label={`Reading round ${round} pairings`} />}
      {mine && !query && (
        <>
          <p className="ef-kicker">Your board</p>
          <ul className="ef-pairs">
            <PairRow id={id} game={mine} me={me} />
          </ul>
        </>
      )}
      <ul className="ef-pairs">
        {shown.map((game) => (
          <PairRow key={game.board} id={id} game={game} me={me} />
        ))}
      </ul>
    </>
  );
}

function PairRow({ id, game, me }: { id: string; game: Pairing; me: number | null }) {
  const isMine = me != null && (game.white.startNo === me || game.black?.startNo === me);
  const side = (s: Pairing['white'], colour: 'white' | 'black', score: number | null) => (
    <Link
      href={s.startNo ? `/t/${id}/p/${s.startNo}${me ? `?me=${me}` : ''}` : '#'}
      className={`ef-pair__side${s.startNo === me ? ' ef-pair__side--me' : ''}`}
    >
      <span className={`ef-piece ef-piece--${colour}`} aria-label={colour} />
      <span className="ef-pair__name">
        {s.title && <span className="ef-title">{s.title}</span>}
        {tidyName(s.name)}
      </span>
      <span className="ef-pair__rtg">{s.rating ?? '—'}</span>
      <span className="ef-pair__pts">{points(s.points)}</span>
      <Changed value={score} className="ef-pair__score">
        {score == null ? '' : points(score)}
      </Changed>
    </Link>
  );

  return (
    <li className={`ef-pair${isMine ? ' ef-pair--mine' : ''}`}>
      <span className="ef-pair__bd">{game.board}</span>
      <div className="ef-pair__sides">
        {side(game.white, 'white', game.result?.white ?? null)}
        {game.black ? (
          side(game.black, 'black', game.result?.black ?? null)
        ) : (
          <span className="ef-pair__side ef-pair__side--none">{game.bye ? 'Bye' : 'Not paired'}</span>
        )}
      </div>
    </li>
  );
}

function StandingsView({ id, round, me }: { id: string; round: number | null; me: number | null }) {
  const standings = useJson<{ rows: StandingRow[] }>(`/api/cr/${id}/standings${round ? `?rd=${round}` : ''}`, {
    refreshMs: 60_000,
  });
  const [query, setQuery] = useState('');
  const meRef = useRef<HTMLLIElement>(null);
  const rows = standings.data?.rows ?? [];
  const mine = rows.find((r) => r.startNo === me);
  const shown = rows.filter((r) => matches(query, r.name, r.federation));

  return (
    <>
      {mine && (
        <div className="ef-mebar">
          <span>
            YOU · #{mine.rank} · {points(mine.points)} PTS
          </span>
          <button type="button" className="ef-link" onClick={() => meRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })}>
            Jump to me ▼
          </button>
        </div>
      )}
      <Search value={query} onChange={setQuery} placeholder="Find a player or federation" />
      {standings.error && !standings.data && <p className="ef-error">{standings.error}</p>}
      {standings.loading && !standings.data && <Loading label="Reading standings" />}
      <ul className="ef-rows">
        {shown.map((r) => (
          <li
            key={`${r.rank}-${r.startNo}-${r.name}`}
            ref={r.startNo === me ? meRef : undefined}
            className={`ef-row${r.startNo === me ? ' ef-row--active' : ''}`}
          >
            <span className="ef-row__lead">{r.rank ?? ''}</span>
            <span className="ef-row__main">
              <Link href={r.startNo ? `/t/${id}/p/${r.startNo}${me ? `?me=${me}` : ''}` : '#'} className="ef-rowlink">
                <strong>
                  {r.title && <span className="ef-title">{r.title}</span>}
                  {tidyName(r.name)}
                </strong>
                <span className="ef-sub">{[r.federation, r.rating ?? 'Unrated'].filter(Boolean).join(' · ')}</span>
              </Link>
            </span>
            <Changed value={r.points} className="ef-row__trail">
              {points(r.points)}
            </Changed>
          </li>
        ))}
      </ul>
    </>
  );
}

function CardView({ id, me }: { id: string; me: number }) {
  const player = useJson<PlayerResponse>(`/api/cr/${id}/player/${me}`, { refreshMs: 60_000 });
  if (player.error && !player.data) return <p className="ef-error">{player.error}</p>;
  if (!player.data) return <Loading label="Reading your card" />;
  return (
    <>
      <p className="ef-kicker">{tidyName(player.data.header.name)}</p>
      <PlayerCardView tournamentId={id} player={player.data} me={me} />
    </>
  );
}

function Entrants({ overview, me }: { overview: Overview; me: number | null }) {
  const [query, setQuery] = useState('');
  const shown = overview.players.filter((x) => matches(query, x.name, x.federation));
  return (
    <>
      <p className="ef-help">Round 1 isn&apos;t paired yet. Registered players:</p>
      <Search value={query} onChange={setQuery} placeholder="Find a player" />
      <ul className="ef-rows">
        {shown.map((x) => (
          <li key={x.startNo} className={`ef-row${x.startNo === me ? ' ef-row--active' : ''}`}>
            <span className="ef-row__lead">{x.startNo}</span>
            <span className="ef-row__main">
              <strong>{tidyName(x.name)}</strong>
              <span className="ef-sub">{[x.federation, x.rating ?? 'Unrated'].filter(Boolean).join(' · ')}</span>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

function InfoView({ overview }: { overview: Overview }) {
  const d = overview.details;
  const facts = useMemo(
    () =>
      [
        ['Type', d.type],
        ['Rounds', overview.totalRounds],
        ['Time control', d.timeControl],
        ['Location', d.location],
        ['Dates', d.date],
        ['Chief arbiter', d.arbiter],
        ['Organizer', d.organizer],
        ['Players', overview.players.length],
        ['Last update', overview.menu?.lastUpdate],
      ].filter(([, v]) => v != null && v !== ''),
    [overview, d],
  );

  return (
    <>
      <Panel code="05 / INFO" title="Details">
        <dl className="ef-spec">
          {facts.map(([label, value]) => (
            <div key={String(label)} className="ef-spec__item ef-spec__item--wide">
              <dt>{label}</dt>
              <dd>{String(value)}</dd>
            </div>
          ))}
        </dl>
      </Panel>
      {overview.schedule.length > 0 && (
        <Panel code="06 / SCHEDULE" title="Playing schedule">
          <ul className="ef-rows">
            {overview.schedule.map((s) => (
              <li key={s.round} className="ef-row">
                <span className="ef-row__lead">R{s.round}</span>
                <span className="ef-row__main">{s.date ?? '—'}</span>
                <span className="ef-row__trail">{s.time ?? ''}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <p className="ef-help">
        <a className="ef-link" href={`https://chess-results.com/tnr${overview.id}.aspx?lan=1`} target="_blank" rel="noreferrer">
          Open on chess-results ↗
        </a>
      </p>
    </>
  );
}
