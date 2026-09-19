'use client';

import Link from '@/components/NavLink';
import { useState } from 'react';
import { Button, Chip, HazardBanner, Panel } from '@/components/ui';
import { PasscodeGate } from '@/components/PasscodeGate';
import { TopBar } from '@/components/TopBar';
import { useAccount } from '@/components/useAccount';
import type { Follow } from '@/lib/client/types';
import { tidyName } from '@/lib/client/format';
import { toast } from '@/components/Motion';
import { Screen } from '@/components/Screen';

/** FOLLOW: yourself plus teammates, students or your kid — each gets their own alerts. */
export default function FollowPage() {
  const { feed, needsLogin, unlock } = useAccount({ refreshMs: 15_000 });
  const follows = feed.data?.follows ?? [];
  const [editing, setEditing] = useState<Follow | 'new' | null>(null);

  const status = (follow: Follow) => {
    const seen = feed.data?.feed.follows.find((f) => f.id === follow.id);
    if (!seen) return <Chip tone="info">Checking</Chip>;
    if (seen.tournaments.some((t) => t.latestPaired && !t.latestPaired.result)) return <Chip tone="accent" solid>Playing</Chip>;
    if (seen.tournaments.length > 0) return <Chip tone="ok">Active</Chip>;
    return <Chip tone="alert">Not found</Chip>;
  };

  async function remove(follow: Follow) {
    if (!window.confirm(`Stop following ${tidyName(follow.playerName)}?`)) return;
    await fetch(`/api/follows?id=${encodeURIComponent(follow.id)}`, { method: 'DELETE' });
    toast(`Stopped following ${tidyName(follow.playerName)}`);
    feed.reload();
  }

  return (
    <Screen>
      <TopBar caption="AIC // WATCHLIST" title="Follow" />
      {needsLogin && <PasscodeGate onUnlocked={unlock} />}

      {!needsLogin && feed.data && (
        <>
          {follows.length === 0 && editing == null && (
            <p className="ef-help">Start with yourself. Add teammates, students or family after that.</p>
          )}

          {follows.map((follow) =>
            editing !== 'new' && editing?.id === follow.id ? (
              <FollowForm
                key={follow.id}
                initial={follow}
                onDone={() => {
                  setEditing(null);
                  feed.reload();
                }}
              />
            ) : (
              <Panel
                key={follow.id}
                code={follow.isMe ? '01 / YOU' : '02 / FOLLOWING'}
                title={tidyName(follow.playerName) || `FIDE ${follow.fideId}`}
                status={status(follow)}
                active={follow.isMe}
              >
                <p className="ef-help">
                  {[follow.fideId ? `FIDE ${follow.fideId}` : null, follow.autoDiscover ? 'Auto-discovery on' : 'Pinned events only']
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <ul className="ef-taglist">
                  {(feed.data?.feed.follows.find((f) => f.id === follow.id)?.tournaments ?? []).map((t) => (
                    <li key={t.id}>
                      <Link className="ef-link" href={`/t/${t.id}?p=${t.startNo}`}>
                        {t.title}
                      </Link>
                    </li>
                  ))}
                </ul>
                <div className="ef-actions">
                  <Button variant="secondary" onClick={() => setEditing(follow)}>
                    Edit
                  </Button>
                  <Button variant="secondary" onClick={() => remove(follow)}>
                    Remove
                  </Button>
                </div>
              </Panel>
            ),
          )}

          {editing === 'new' ? (
            <FollowForm
              initial={null}
              firstIsMe={follows.length === 0}
              onDone={() => {
                setEditing(null);
                feed.reload();
              }}
            />
          ) : (
            editing == null && (
              <Button arrow onClick={() => setEditing('new')}>
                {follows.length === 0 ? 'Add yourself' : 'Follow a player'}
              </Button>
            )
          )}
        </>
      )}
    </Screen>
  );
}

function FollowForm({ initial, firstIsMe = false, onDone }: { initial: Follow | null; firstIsMe?: boolean; onDone: () => void }) {
  const [playerName, setPlayerName] = useState(initial?.playerName ?? '');
  const [fideId, setFideId] = useState(initial?.fideId ?? '');
  const [isMe, setIsMe] = useState(initial?.isMe ?? firstIsMe);
  const [autoDiscover, setAutoDiscover] = useState(initial?.autoDiscover ?? true);
  const [links, setLinks] = useState((initial?.tournaments ?? []).map((t) => `https://chess-results.com/tnr${t.id}.aspx`).join('\n'));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch('/api/follows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: initial?.id,
        playerName,
        fideId,
        isMe,
        autoDiscover,
        tournaments: links.split(/\s+/).filter(Boolean),
      }),
    }).catch(() => null);
    setBusy(false);
    if (response?.ok) {
      toast(`${tidyName(playerName) || 'Player'} saved · checking chess-results`, 'ok');
      onDone();
    }
    else setError((await response?.json().catch(() => null))?.error ?? 'No connection.');
  }

  return (
    <Panel code={initial ? '03 / EDIT' : '03 / ADD'} title={initial ? 'Edit player' : 'Add a player'} active>
      <form className="ef-form" onSubmit={save}>
        <label className="ef-field">
          <span className="ef-field__label">Name, as on chess-results</span>
          <span className="ef-focus">
            <input
              className="ef-input"
              placeholder="Suriyajan, Chayapol"
              autoComplete="off"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
            />
          </span>
        </label>
        <label className="ef-field">
          <span className="ef-field__label">FIDE ID (optional, removes any doubt)</span>
          <span className="ef-focus">
            <input
              className="ef-input"
              inputMode="numeric"
              placeholder="6200456"
              value={fideId}
              onChange={(e) => setFideId(e.target.value)}
            />
          </span>
        </label>
        <label className="ef-field">
          <span className="ef-field__label">Tournament links (one per line, optional)</span>
          <span className="ef-focus">
            <textarea
              className="ef-input ef-textarea"
              rows={3}
              placeholder="https://chess-results.com/tnr1486488.aspx"
              value={links}
              onChange={(e) => setLinks(e.target.value)}
            />
          </span>
        </label>
        <label className="ef-check">
          <input type="checkbox" checked={isMe} onChange={(e) => setIsMe(e.target.checked)} />
          <span>This is me (shown first, alerts without a name prefix)</span>
        </label>
        <label className="ef-check">
          <input type="checkbox" checked={autoDiscover} onChange={(e) => setAutoDiscover(e.target.checked)} />
          <span>Find this player&apos;s tournaments automatically</span>
        </label>
        {autoDiscover && (
          <p className="ef-help">
            Auto-discovery uses chess-results&apos; player search, which can break when the site changes. Adding the
            tournament link above always works.
          </p>
        )}
        {error && <HazardBanner label="Not saved">{error}</HazardBanner>}
        <div className="ef-actions">
          <Button type="submit" arrow disabled={busy}>
            {busy ? 'Saving' : 'Save'}
          </Button>
          <Button variant="secondary" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
    </Panel>
  );
}

