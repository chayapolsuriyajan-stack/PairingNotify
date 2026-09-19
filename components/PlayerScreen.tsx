'use client';

import Link from '@/components/NavLink';
import type { Overview, PlayerResponse } from '@/lib/client/types';
import { nameKey, pad2, resultLabel, syncLabel, tidyName } from '@/lib/client/format';
import { HazardBanner, Panel } from './ui';
import { Loading } from './Motion';
import { PlayerCardView } from './PlayerCardView';
import { SyncReadout, TopBar } from './TopBar';
import { useJson } from './useJson';
import { useAccount } from './useAccount';
import { Screen } from '@/components/Screen';

/**
 * Opponent scout: their card in this event, their FIDE profile, and whether you've
 * met them before in any event the app has seen for you.
 */
export function PlayerScreen({ id, startNo, me }: { id: string; startNo: number; me: number | null }) {
  const player = useJson<PlayerResponse>(`/api/cr/${id}/player/${startNo}`, { refreshMs: 60_000 });
  const overview = useJson<Overview>(`/api/cr/${id}/overview`);
  const { feed } = useAccount({ refreshMs: 0 });

  const name = player.data?.header.name ?? overview.data?.players.find((x) => x.startNo === startNo)?.name ?? '';
  const key = nameKey(name);

  // Head-to-head: finished games against them in your OTHER events the poller has seen.
  const myFollow = feed.data?.feed.follows.find((f) => f.isMe);
  const meetings = key
    ? (myFollow?.tournaments ?? [])
        .filter((t) => t.id !== id)
        .flatMap((t) =>
          t.rounds
            .filter((r) => r.paired && r.result && nameKey(r.opponent) === key)
            .map((r) => ({ event: t, round: r })),
        )
    : [];

  return (
    <Screen>
      <TopBar
        caption={`EVENT ${id} // PLAYER ${startNo}`}
        title="Scout"
        right={
          <SyncReadout
            label={syncLabel(player.updatedAt)}
            offline={player.offline}
            busy={player.fetching}
            onRefresh={player.reload}
          />
        }
      />
      {player.error && !player.data && <HazardBanner label="Can't load this player">{player.error}</HazardBanner>}
      {!player.data && !player.error && <Loading label="Reading player card" />}

      {player.data && (
        <>
          <header className="ef-event">
            <h2 className="ef-event__title">
              {player.data.header.title && <span className="ef-title">{player.data.header.title}</span>}
              {tidyName(name)}
            </h2>
            <p className="ef-event__me">
              #{startNo}
              {overview.data?.title ? ` · ${overview.data.title}` : ''}
            </p>
          </header>

          {meetings.length > 0 && (
            <Panel code="07 / HEAD TO HEAD" title="You've met before" active>
              <ul className="ef-rows">
                {meetings.map(({ event, round }) => (
                  <li key={`${event.id}-${round.round}`} className={`ef-row ef-row--tick-${round.colour ?? 'white'}`}>
                    <span className="ef-row__lead">R{pad2(round.round)}</span>
                    <span className="ef-row__main">
                      <Link href={`/t/${event.id}?p=${event.startNo}`} className="ef-rowlink">
                        <strong>{event.title}</strong>
                        <span className="ef-sub">You had {round.colour ?? '?'}</span>
                      </Link>
                    </span>
                    <span className="ef-row__trail">{resultLabel(round.result) || '·'}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <PlayerCardView tournamentId={id} player={player.data} me={me} highlightOpponent={me} />

          {me && me !== startNo && (
            <p className="ef-help">
              <Link className="ef-link" href={`/t/${id}?p=${me}`}>
                ◀ Back to your event
              </Link>
            </p>
          )}
        </>
      )}
    </Screen>
  );
}
