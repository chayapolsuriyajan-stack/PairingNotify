'use client';

import { useState } from 'react';
import { Button, Panel } from '@/components/ui';

/** Shown when the server has APP_PASSCODE set and this device hasn't entered it. */
export function PasscodeGate({ onUnlocked }: { onUnlocked: () => void }) {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode }),
    }).catch(() => null);
    setBusy(false);
    if (response?.ok) onUnlocked();
    else setError(response ? 'Wrong passcode.' : 'No connection.');
  }

  return (
    <Panel code="00 / ACCESS" title="Enter passcode" serial="AIC-PN-LOCK">
      <form onSubmit={submit} className="ef-form">
        <p className="ef-help">
          Your follows and alerts are private. Enter the passcode you set as <code>APP_PASSCODE</code>. You only need
          to do this once on each device.
        </p>
        <label className="ef-field">
          <span className="ef-field__label">Passcode</span>
          <input
            className="ef-input"
            type="password"
            autoComplete="current-password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            required
          />
        </label>
        {error && <p className="ef-error">{error}</p>}
        <Button type="submit" arrow disabled={busy}>
          {busy ? 'Checking' : 'Unlock'}
        </Button>
      </form>
    </Panel>
  );
}
