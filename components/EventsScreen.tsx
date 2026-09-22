'use client';

import Link from '@/components/NavLink';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { parseTournamentRef } from '@/lib/ref.js';
import { pad2, syncLabel, tidyName } from '@/lib/client/format';
import type { Follow, FoundPlayer, FoundTournament, SearchResponse } from '@/lib/client/types';
import { forgetEvent, recentEvents, rememberEvent, type RecentEvent } from '@/lib/client/recents';
import { Button, Chip, HazardBanner, Panel, SectionHeader } from './ui';
import { PasscodeGate } from './PasscodeGate';
import { SyncReadout, TopBar } from './TopBar';
import { useAccount } from './useAccount';
import { toast } from './Motion';
import { Screen } from '@/components/Screen';

/**
 * EVENTS: every tournament the app watches, the ones you opened recently, and a search
 * that finds a player's events on chess-results by FIDE ID or name.
 *
 * Pasting a link is still supported (it is also the Android share target) but it is no
 * longer the way in: needing a link for every event sent you back to chess-results,
 * which is the site this app exists to keep you out of during a round.
 */
export function EventsScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const { feed, needsLogin, unlock } = useAccount({ refreshMs: 60_000 });
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [recents, setRecents] = useState<RecentEvent[]>([]);

  useEffect(() => setRecents(recentEvents()), []);

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
  const unseen = recents.filter((r) => !events.has(r.id));
  // Panel/section serials count what is on screen, so they never skip a number.
  let serial = 0;
  const code = () => String(++serial).padStart(2, '0');

  return (
    <Screen>
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

      {needsLogin && <PasscodeGate onUnlocked={unlock} />}

      {!needsLogin && <FindPanel code={code()} follows={feed.data?.follows ?? []} onFollowed={() => feed.reload()} />}

      {events.size > 0 && (
        <>
          <SectionHeader index={code()} caption="Watching">
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

      {unseen.length > 0 && (
        <>
          <SectionHeader index={code()} caption="Opened before">
            Recent
          </SectionHeader>
          <ul className="ef-rows">
            {unseen.map((event) => (
              <li key={event.id} className="ef-row">
                <span className="ef-row__main">
                  <Link href={`/t/${event.id}${event.startNo ? `?p=${event.startNo}` : ''}`} className="ef-rowlink">
                    <strong>{event.title}</strong>
                    <span className="ef-sub">Event {event.id}</span>
                  </Link>
                </span>
                <span className="ef-row__trail">
                  <button
                    type="button"
                    className="ef-iconbtn"
                    aria-label={`Forget ${event.title}`}
                    onClick={() => {
                      forgetEvent(event.id);
                      setRecents(recentEvents());
                    }}
                  >
                    ✕
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <Panel code={`${code()} / LINK`} title="Open by link or number">
        <form
          className="ef-form"
          onSubmit={(e) => {
            e.preventDefault();
            open(input);
          }}
        >
          <label className="ef-field">
            <span className="ef-field__label">Chess-results link or number</span>
            <span className="ef-focus">
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
            </span>
          </label>
          {error && <p className="ef-error">{error}</p>}
          <Button type="submit" variant="secondary">
            Open
          </Button>
        </form>
      </Panel>

      {!needsLogin && feed.data && events.size === 0 && unseen.length === 0 && (
        <p className="ef-help">
          Nothing watched yet. Search for yourself above, or add yourself on the{' '}
          <Link className="ef-link" href="/follow">
            Follow
          </Link>{' '}
          tab.
        </p>
      )}
    </Screen>
  );
}

/** Search chess-results for a player, then open or follow what comes back. */
function FindPanel({ code, follows, onFollowed }: { code: string; follows: Follow[]; onFollowed: () => void }) {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResponse | null>(null);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    setResult(null);
    const response = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`).catch(() => null);
    const body = await response?.json().catch(() => null);
    setBusy(false);
    if (response?.ok) setResult(body as SearchResponse);
    else setError(body?.error ?? 'No connection to chess-results.');
  }

  return (
    <Panel code={`${code} / FIND`} title="Find a player's events" active>
      <form className="ef-form" onSubmit={search}>
        <label className="ef-field">
          <span className="ef-field__label">FIDE ID (best) or name</span>
          <span className="ef-focus">
            <input
              className="ef-input"
              autoComplete="off"
              placeholder="6200456 — or Suriyajan, Chayapol"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setError(null);
              }}
            />
          </span>
        </label>
        <Button type="submit" arrow disabled={busy}>
          {busy ? 'Searching' : 'Search'}
        </Button>
      </form>

      {error && <HazardBanner label="Nothing found">{error}</HazardBanner>}
      {result?.players.length === 0 && (
        <p className="ef-help">Found that player, but no tournament in the last three weeks.</p>
      )}
      {result?.players.map((player) => (
        <PlayerResult key={`${player.fideId ?? player.name}`} player={player} follows={follows} onFollowed={onFollowed} />
      ))}
    </Panel>
  );
}

function PlayerResult({ player, follows, onFollowed }: { player: FoundPlayer; follows: Follow[]; onFollowed: () => void }) {
  const [busy, setBusy] = useState(false);
  const existing = follows.find((f) =>
    player.fideId && f.fideId ? f.fideId === player.fideId : tidyName(f.playerName).toLowerCase() === tidyName(player.name).toLowerCase(),
  );

  /** Follow this player (alerts for every event they enter, found automatically). */
  async function follow() {
    setBusy(true);
    const response = await fetch('/api/follows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: existing?.id,
        playerName: player.name,
        fideId: player.fideId ?? existing?.fideId ?? '',
        isMe: existing?.isMe ?? follows.length === 0,
        autoDiscover: true,
        tournaments: (existing?.tournaments ?? []).map((t) => t.id),
      }),
    }).catch(() => null);
    setBusy(false);
    if (response?.ok) {
      toast(`Following ${tidyName(player.name)}`, 'ok');
      onFollowed();
    } else toast('Could not save that player', 'alert');
  }

  return (
    <div className="ef-result">
      <p className="ef-result__head">
        <strong>{tidyName(player.name)}</strong>
        {player.fideId && <Chip>FIDE {player.fideId}</Chip>}
        {player.federation && <Chip>{player.federation}</Chip>}
        {existing && <Chip tone="ok">Followed</Chip>}
      </p>
      <ul className="ef-rows">
        {player.tournaments.map((t) => (
          <FoundRow key={t.id} tournament={t} player={player} />
        ))}
      </ul>
      {!existing && (
        <Button variant="secondary" disabled={busy} onClick={follow}>
          {busy ? 'Saving' : 'Alert me for this player'}
        </Button>
      )}
    </div>
  );
}

function FoundRow({ tournament, player }: { tournament: FoundTournament; player: FoundPlayer }) {
  const href = `/t/${tournament.id}${tournament.startNo ? `?p=${tournament.startNo}` : ''}`;
  return (
    <li className="ef-row">
      <span className="ef-row__main">
        <Link
          href={href}
          className="ef-rowlink"
          onClick={() => rememberEvent({ id: tournament.id, title: tournament.label, startNo: tournament.startNo })}
        >
          <strong>{tournament.label}</strong>
          <span className="ef-sub">
            {[tournament.endDate, tournament.startNo ? `#${tournament.startNo}` : null, tidyName(player.name)]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </Link>
      </span>
    </li>
  );
}
