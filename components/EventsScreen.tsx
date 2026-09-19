'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { parseTournamentRef } from '@/lib/ref.js';
import { pad2, syncLabel, tidyName } from '@/lib/client/format';
import { Button, Panel, SectionHeader } from './ui';
import { PasscodeGate } from './PasscodeGate';
import { SyncReadout, TopBar } from './TopBar';
import { useAccount } from './useAccount';

/**
 * EVENTS: every tournament the app watches for you and the players you follow, plus
 * "open any tournament" by pasting its chess-results link (also the share target, so
 * sharing a chess-results page to the app on Android lands here).
 */
export function EventsScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const { feed, needsLogin, unlock } = useAccount({ refreshMs: 60_000 });
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const open = (value: string) => {
    const ref = parseTournamentRef(value);
    if (!ref) {
      setError('Paste a chess-results tournament link, or type its number.');
      return;
    }
    router.push(`/t/${ref.id}${ref.startNo ? `?p=${ref.startNo}` : ''}`);
  };

  // Share target: /t?url=... or /t?text=...
  useEffect(() => {
    const shared = params.get('url') || params.get('text');
    if (shared && parseTournamentRef(shared)) open(shared);
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  const events = new Map<string, { id: string; title: string; players: { name: string; startNo: number; isMe: boolean; round: number | null }[] }>();
  for (const follow of feed.data?.feed.follows ?? []) {
    for (const t of follow.tournaments) {
      const entry = events.get(t.id) ?? { id: t.id, title: t.title, players: [] };
      entry.players.push({ name: follow.playerName, startNo: t.startNo, isMe: follow.isMe, round: t.latestPaired?.round ?? null });
      events.set(t.id, entry);
    }
  }

  return (
    <main className="ef-page">
      <TopBar
        caption="AIC // EVENT INDEX"
        title="Events"
        right={
          !needsLogin && (
            <SyncReadout
              label={syncLabel(feed.data?.feed.generatedAt ? Date.parse(feed.data.feed.generatedAt) : feed.updatedAt)}
              offline={feed.offline}
            />
          )
        }
      />

      <Panel code="01 / OPEN" title="Open a tournament">
        <form
          className="ef-form"
          onSubmit={(e) => {
            e.preventDefault();
            open(input);
          }}
        >
          <label className="ef-field">
            <span className="ef-field__label">Chess-results link or number</span>
            <input
              className="ef-input"
              inputMode="url"
              placeholder="https://chess-results.com/tnr1486488.aspx"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setError(null);
              }}
            />
          </label>
          {error && <p className="ef-error">{error}</p>}
          <Button type="submit" arrow>
            Open
          </Button>
        </form>
      </Panel>

      {needsLogin && <PasscodeGate onUnlocked={unlock} />}

      {events.size > 0 && (
        <>
          <SectionHeader index="02" caption="Watching">
            Your events
          </SectionHeader>
          <ul className="ef-rows">
            {[...events.values()].map((event) => {
              const lead = event.players.find((x) => x.isMe) ?? event.players[0];
              return (
                <li key={event.id} className="ef-row">
                  <span className="ef-row__lead">{lead.round ? `R${pad2(lead.round)}` : '—'}</span>
                  <span className="ef-row__main">
                    <Link href={`/t/${event.id}?p=${lead.startNo}`} className="ef-rowlink">
                      <strong>{event.title}</strong>
                      <span className="ef-sub">{event.players.map((x) => tidyName(x.name)).join(' · ')}</span>
                    </Link>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {!needsLogin && feed.data && events.size === 0 && (
        <p className="ef-help">
          Nothing watched yet. Add yourself on the <Link className="ef-link" href="/follow">Follow</Link> tab, or open
          any tournament above.
        </p>
      )}
    </main>
  );
}
