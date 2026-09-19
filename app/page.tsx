'use client';

import Link from '@/components/NavLink';
import { useEffect, useMemo } from 'react';
import { Button, HazardBanner, Panel, Row, RowList, SectionHeader } from '@/components/ui';
import { NextGameHero } from '@/components/NextGameHero';
import { ForecastCard } from '@/components/ForecastCard';
import { PasscodeGate } from '@/components/PasscodeGate';
import { SyncReadout, TopBar } from '@/components/TopBar';
import { markSeen, useAccount } from '@/components/useAccount';
import { useJson } from '@/components/useJson';
import { Loading, toast } from '@/components/Motion';
import type { FeedFollow, Overview } from '@/lib/client/types';
import { pad2, roundStart, syncLabel, tidyName } from '@/lib/client/format';
import { Screen } from '@/components/Screen';

/** NOW: your next game, the forecast for the round after, and everyone you follow. */
export default function NowPage() {
  const { config, feed, needsLogin, unlock } = useAccount({ refreshMs: 30_000 });
  const follows = feed.data?.feed.follows ?? [];
  const me = follows.find((f) => f.isMe) ?? null;
  const myEvent = me?.tournaments[0] ?? null;
  const others = follows.filter((f) => f !== me);

  const overview = useJson<Overview>(myEvent ? `/api/cr/${myEvent.id}/overview` : null, { refreshMs: 60_000 });
  const start = roundStart(overview.data?.schedule, myEvent?.latestPaired?.round);
  const isNew = useMemo(
    () => (myEvent?.latestPaired ? markSeen(`${myEvent.id}:${myEvent.startNo}`, myEvent.latestPaired.round) : false),
    [myEvent?.id, myEvent?.startNo, myEvent?.latestPaired?.round], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // The signature moment (design.md §6.6) also posts a system strip at the top.
  useEffect(() => {
    const game = myEvent?.latestPaired;
    if (!isNew || !game) return;
    toast(['Pairing confirmed', `RD ${game.round}`, game.board != null ? `BD ${game.board}` : null].filter(Boolean).join(' · '));
  }, [isNew]); // eslint-disable-line react-hooks/exhaustive-deps

  // Losing the network mid-tournament is worth saying once, not silently.
  useEffect(() => {
    if (feed.offline) toast('Offline · showing saved copy', 'alert');
  }, [feed.offline]);

  const generatedAt = feed.data?.feed.generatedAt ? Date.parse(feed.data.feed.generatedAt) : null;
  const degraded = follows.find((f) => f.discoveryError);
  const loading = config.loading || (feed.loading && !feed.data);

  return (
    <Screen>
      <TopBar
        caption="AIC // PAIRING MONITOR"
        title="Now"
        right={
          !needsLogin && (
            <SyncReadout
              label={syncLabel(generatedAt ?? feed.updatedAt)}
              offline={feed.offline}
              busy={feed.fetching || overview.fetching}
              onRefresh={() => {
                feed.reload();
                overview.reload();
              }}
            />
          )
        }
      />

      {needsLogin && <PasscodeGate onUnlocked={unlock} />}
      {config.error && !config.data && <HazardBanner label="No connection">{config.error}</HazardBanner>}
      {loading && !needsLogin && <Loading label="Syncing pairings" />}

      {!loading && !needsLogin && feed.data && follows.length === 0 && feed.data.follows.length === 0 && (
        <Panel code="01 / SETUP" title="Who are you?" serial="AIC-PN-0001">
          <p className="ef-help">
            Add yourself once: your name as chess-results spells it (or your FIDE ID) and, optionally, the tournament
            link. Pairings then land here and on your lock screen.
          </p>
          <Button href="/follow" arrow>
            Add yourself
          </Button>
        </Panel>
      )}

      {!loading && !needsLogin && feed.data && follows.length === 0 && feed.data.follows.length > 0 && (
        <Panel code="01 / SYNC" title="Fetching your pairings" serial="AIC-PN-0001">
          <p className="ef-help">
            The first check runs right after you add a player and then every couple of minutes. Tap ↻ in a
            moment.
          </p>
        </Panel>
      )}

      {degraded && (
        <HazardBanner label="Auto-discovery degraded">
          Couldn&apos;t find tournaments for {tidyName(degraded.playerName)}: {degraded.discoveryError} Tournaments added
          by link still work.
        </HazardBanner>
      )}

      {me && !myEvent && (
        <Panel code="01 / STANDBY" title={tidyName(me.playerName)}>
          <p className="ef-help">
            No tournament found yet for this name. Paste your tournament link on the Follow tab, or check the spelling
            matches chess-results.
          </p>
        </Panel>
      )}

      {myEvent && <NextGameHero tournament={myEvent} start={start} isNew={isNew} totalRounds={overview.data?.totalRounds ?? null} />}

      {myEvent && overview.data && overview.data.started && (
        <ForecastCard overview={overview.data} me={myEvent.startNo} compact />
      )}

      {others.length > 0 && (
        <>
          <SectionHeader index="02" caption="Following">
            Your players
          </SectionHeader>
          <RowList>
            {others.map((follow) => (
              <FollowedRow key={follow.id} follow={follow} />
            ))}
          </RowList>
        </>
      )}

      {feed.data?.feed.errors?.length ? (
        <p className="ef-help ef-help--warn">
          {feed.data.feed.errors.length} tournament(s) couldn&apos;t be read on the last check. They&apos;ll be retried
          automatically.
        </p>
      ) : null}
    </Screen>
  );
}

function FollowedRow({ follow }: { follow: FeedFollow }) {
  const event = follow.tournaments[0];
  const game = event?.latestPaired;
  return (
    <Row
      tick={game?.colour ?? undefined}
      leading={game ? `R${pad2(game.round)}` : '—'}
      trailing={game?.board != null ? `BD ${game.board}` : undefined}
    >
      {event ? (
        <Link href={`/t/${event.id}?p=${event.startNo}`} className="ef-rowlink">
          <strong>{tidyName(follow.playerName)}</strong>
          <span className="ef-sub">
            {game ? `vs ${tidyName(game.opponent)}${game.rating ? ` (${game.rating})` : ''}` : 'Waiting for pairings'}
          </span>
        </Link>
      ) : (
        <>
          <strong>{tidyName(follow.playerName)}</strong>
          <span className="ef-sub">No tournament yet</span>
        </>
      )}
    </Row>
  );
}
