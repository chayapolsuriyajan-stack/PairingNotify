'use client';

import { useState } from 'react';
import { Button, Panel } from '@/components/ui';

/** Shown until this device signs in: the owner's passcode, or an invite / sign-in code. */
export function PasscodeGate({ onUnlocked }: { onUnlocked: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    }).catch(() => null);
    setBusy(false);
    if (response?.ok) onUnlocked();
    else setError(response ? 'That passcode or code doesn’t work. Codes expire a week after they’re made.' : 'No connection.');
  }

  return (
    <Panel code="00 / ACCESS" title="Sign in" serial="AIC-PN-LOCK">
      <form onSubmit={submit} className="ef-form">
        <p className="ef-help">
          Got an invite? Enter the code (like <code>K7QM-3XTP</code>) to get your own follows and alerts. Running this
          app yourself? Enter your <code>APP_PASSCODE</code>. Once per device.
        </p>
        <label className="ef-field">
          <span className="ef-field__label">Passcode or invite code</span>
          <span className="ef-focus">
            <input
              className="ef-input"
              type="password"
              autoComplete="current-password"
              autoCapitalize="characters"
              spellCheck={false}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
          </span>
        </label>
        {error && <p className="ef-error">{error}</p>}
        <Button type="submit" arrow disabled={busy}>
          {busy ? 'Checking' : 'Sign in'}
        </Button>
      </form>
    </Panel>
  );
}
