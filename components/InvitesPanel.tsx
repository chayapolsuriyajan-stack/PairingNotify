'use client';

import { useState } from 'react';
import { Button, Chip, Panel } from '@/components/ui';
import { useJson } from '@/components/useJson';
import { toast } from '@/components/Motion';

interface Code {
  code: string;
  name: string | null;
  createdAt: number;
  expiresAt: number;
}

type InvitesResponse =
  | { role: 'owner'; pending: Code[]; users: { id: string; name: string | null; createdAt: number; codes: Code[] }[] }
  | { role: 'user'; codes: Code[] };

const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** Share a code with the system share sheet, falling back to the clipboard. */
async function share(code: string, name: string | null) {
  const text = `${name ? `${name}, here's` : "Here's"} your PairingNotify invite: ${code}\nOpen ${location.origin} and enter the code.`;
  try {
    if (navigator.share) return await navigator.share({ text });
    await navigator.clipboard.writeText(text);
    toast('Invite copied', 'ok');
  } catch {
    // Share sheet dismissed: nothing to do.
  }
}

async function call(method: string, query = '', body?: object) {
  const response = await fetch(`/api/invites${query}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error ?? 'Request failed');
  return json;
}

/**
 * The owner invites people (each gets their own follows, devices and alerts) and can
 * remove them. An invited person sees their own sign-in code, for their other devices.
 */
export function InvitesPanel() {
  const invites = useJson<InvitesResponse>('/api/invites');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      toast((error as Error).message, 'alert');
    }
    setBusy(false);
    invites.reload();
  }

  const data = invites.data;
  if (!data) return null;

  if (data.role === 'user') {
    const code = data.codes[0];
    return (
      <Panel code="05 / ACCOUNT" title="Your sign-in code" serial="AIC-PN-ACCT">
        <p className="ef-help">Use this code to open your account on another phone or computer. Keep it to yourself.</p>
        {code && <p className="ef-code">{code.code}</p>}
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() =>
            run(async () => {
              await call('POST', '', { rotate: true });
              toast('New code · the old one no longer works', 'ok');
            })
          }
        >
          Make a new code
        </Button>
      </Panel>
    );
  }

  return (
    <Panel
      code="07 / INVITES"
      title="Invite people"
      status={<Chip tone="info">{data.users.length} account{data.users.length === 1 ? '' : 's'}</Chip>}
      serial="AIC-PN-INVITE"
    >
      <p className="ef-help">
        Each invite makes one account with its own follows and alerts; you don&apos;t see theirs and they don&apos;t
        see yours. Unused codes expire after a week.
      </p>
      <form
        className="ef-form ef-invite__form"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const invite = await call('POST', '', { name: name || null });
            setName('');
            await share(invite.code, invite.name);
          });
        }}
      >
        <label className="ef-field">
          <span className="ef-field__label">Who is it for? (optional)</span>
          <span className="ef-focus">
            <input className="ef-input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          </span>
        </label>
        <Button type="submit" arrow disabled={busy}>
          Generate invite
        </Button>
      </form>

      {data.pending.length > 0 && (
        <>
          <p className="ef-kicker">Waiting to be used</p>
          <ul className="ef-rows">
            {data.pending.map((i) => (
              <li key={i.code} className="ef-row ef-invite">
                <span className="ef-row__main">
                  <strong className="ef-code ef-code--inline">{i.code}</strong>
                  <span className="ef-sub">
                    {i.name ? `${i.name} · ` : ''}expires {day(i.expiresAt)}
                  </span>
                </span>
                <span className="ef-invite__actions">
                  <button type="button" className="ef-link" onClick={() => share(i.code, i.name)}>
                    Share
                  </button>
                  <button
                    type="button"
                    className="ef-link ef-link--danger"
                    disabled={busy}
                    onClick={() => run(() => call('DELETE', `?code=${encodeURIComponent(i.code)}`))}
                  >
                    Revoke
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {data.users.length > 0 && (
        <>
          <p className="ef-kicker">Accounts</p>
          <ul className="ef-rows">
            {data.users.map((u) => (
              <li key={u.id} className="ef-row ef-invite">
                <span className="ef-row__main">
                  <strong>{u.name ?? 'Unnamed'}</strong>
                  <span className="ef-sub">since {day(u.createdAt)}</span>
                </span>
                <span className="ef-invite__actions">
                  <button
                    type="button"
                    className="ef-link ef-link--danger"
                    disabled={busy}
                    onClick={() => {
                      if (!confirm(`Remove ${u.name ?? 'this account'} and everything in it?`)) return;
                      run(() => call('DELETE', `?user=${encodeURIComponent(u.id)}`));
                    }}
                  >
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}
