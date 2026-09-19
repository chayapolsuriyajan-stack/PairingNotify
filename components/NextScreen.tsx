'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Overview } from '@/lib/client/types';
import { nameKey, syncLabel, tidyName } from '@/lib/client/format';
import { ForecastCard } from './ForecastCard';
import { HazardBanner } from './ui';
import { SyncReadout, TopBar } from './TopBar';
import { useJson } from './useJson';
import { useAccount } from './useAccount';
import { Loading } from './Motion';

/** Full next-round forecast for one player (plan §3a). */
export function NextScreen({ id, p }: { id: string; p: number | null }) {
  const overview = useJson<Overview>(`/api/cr/${id}/overview`, { refreshMs: 60_000 });
  const { feed } = useAccount({ refreshMs: 0 });
  const followed = (feed.data?.feed.follows ?? [])
    .flatMap((f) => f.tournaments.filter((t) => t.id === id).map((t) => ({ isMe: f.isMe, startNo: t.startNo })))
    .sort((a, b) => Number(b.isMe) - Number(a.isMe));
  const [picked, setPicked] = useState<number | null>(null);
  const me = picked ?? p ?? followed[0]?.startNo ?? null;
  const player = overview.data?.players.find((x) => x.startNo === me);

  return (
    <main className="ef-page">
      <TopBar
        caption={`EVENT ${id} // FORECAST`}
        title="Next"
        right={
          <SyncReadout
            label={syncLabel(overview.updatedAt)}
            offline={overview.offline}
            busy={overview.fetching}
            onRefresh={overview.reload}
          />
        }
      />
      {overview.loading && !overview.data && <Loading label={`Reading event ${id}`} />}
      {overview.error && !overview.data && <HazardBanner label="Can't load this event">{overview.error}</HazardBanner>}

      {overview.data && (
        <p className="ef-kicker">
          <Link href={`/t/${id}${me ? `?p=${me}` : ''}`}>{overview.data.title}</Link>
        </p>
      )}

      {overview.data && !overview.data.started && <p className="ef-help">Round 1 isn&apos;t paired yet.</p>}

      {overview.data && overview.data.started && !me && (
        <PlayerPicker overview={overview.data} onPick={setPicked} />
      )}

      {overview.data && overview.data.started && me && (
        <>
          {player && (
            <p className="ef-event__me">
              For {tidyName(player.name)} · #{player.startNo}{' '}
              <button type="button" className="ef-link" onClick={() => setPicked(null)}>
                change
              </button>
            </p>
          )}
          <ForecastCard overview={overview.data} me={me} />
        </>
      )}
    </main>
  );
}

function PlayerPicker({ overview, onPick }: { overview: Overview; onPick: (startNo: number) => void }) {
  const [query, setQuery] = useState('');
  const q = nameKey(query);
  const shown = q ? overview.players.filter((x) => nameKey(x.name).includes(q)).slice(0, 12) : [];
  return (
    <>
      <p className="ef-help">Who should the forecast be for?</p>
      <input
        className="ef-input ef-search"
        type="search"
        placeholder="Type a player's name"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Player name"
      />
      <ul className="ef-rows">
        {shown.map((x) => (
          <li key={x.startNo} className="ef-row">
            <button type="button" className="ef-rowbtn" onClick={() => onPick(x.startNo)}>
              <strong>{tidyName(x.name)}</strong>
              <span className="ef-sub">
                #{x.startNo} · {x.rating ?? 'Unrated'}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
