'use client';

import { useEffect, useState } from 'react';
import { Chip, Panel } from '@/components/ui';
import { Segmented } from '@/components/Segmented';
import { useJson } from '@/components/useJson';
import { toast } from '@/components/Motion';

type Outcome = 'win' | 'draw' | 'loss';
type Style = 'lines' | 'quotes' | 'custom';

interface Settings {
  results: { win: boolean; draw: boolean; loss: boolean; followed: boolean; style: Style; custom: Record<Outcome, string> };
  reminder: { on: boolean; minutes: 15 | 30 | 60; followed: boolean };
  timeZone: string | null;
}

type Patch = { results?: Partial<Omit<Settings['results'], 'custom'>> & { custom?: Partial<Record<Outcome, string>> }; reminder?: Partial<Settings['reminder']>; timeZone?: string };

async function save(patch: Patch): Promise<Settings> {
  const response = await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!response.ok) throw new Error('Could not save');
  return response.json();
}

/** The browser's zone; the poller reads chess-results' local round times in it. */
function deviceZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

const OUTCOMES: { value: Outcome; label: string }[] = [
  { value: 'win', label: 'Win' },
  { value: 'draw', label: 'Draw' },
  { value: 'loss', label: 'Loss' },
];

const EXAMPLES: Record<Style, Record<Outcome, string>> = {
  lines: { win: "Let's note that down.", draw: "That's a close call.", loss: 'Shake it off. Next round.' },
  quotes: {
    win: '“When you see a good move, look for a better one.” — Emanuel Lasker',
    draw: '“The threat is stronger than the execution.” — Aron Nimzowitsch',
    loss: '“You may learn much more from a game you lose than from a game you win.” — Capablanca',
  },
  custom: { win: '', draw: '', loss: '' },
};

/** Result messages and round reminders, per account (lib/settings.js). */
export function AlertsPanel() {
  const remote = useJson<Settings>('/api/settings');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [drafts, setDrafts] = useState<Record<Outcome, string>>({ win: '', draw: '', loss: '' });

  useEffect(() => {
    if (!remote.data) return;
    setSettings(remote.data);
    setDrafts(remote.data.results.custom);
    // Keep the zone current: a player who flies to an event abroad gets the right time.
    const zone = deviceZone();
    if (zone && zone !== remote.data.timeZone) save({ timeZone: zone }).then(setSettings).catch(() => {});
  }, [remote.data]);

  if (!settings) return null;

  const update = (patch: Patch) => {
    // Optimistic: the switch moves at once, the server confirms.
    setSettings((s) =>
      s && {
        ...s,
        results: { ...s.results, ...patch.results, custom: { ...s.results.custom, ...patch.results?.custom } },
        reminder: { ...s.reminder, ...patch.reminder },
      },
    );
    save(patch)
      .then(setSettings)
      .catch((error) => toast((error as Error).message, 'alert'));
  };

  const { results, reminder } = settings;
  const example = (o: Outcome) => (results.style === 'custom' ? results.custom[o] || EXAMPLES.lines[o] : EXAMPLES[results.style][o]);

  return (
    <Panel
      code="03 / ALERTS"
      title="Results & reminders"
      status={<Chip tone={results.win || results.draw || results.loss || reminder.on ? 'ok' : 'neutral'}>{reminder.on ? `${reminder.minutes} min` : 'Off'}</Chip>}
      serial="AIC-PN-ALRT"
    >
      <p className="ef-kicker">After each game</p>
      <div className="ef-checks">
        {OUTCOMES.map((o) => (
          <label key={o.value} className="ef-check">
            <input type="checkbox" checked={results[o.value]} onChange={(e) => update({ results: { [o.value]: e.target.checked } })} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
      <Segmented<Style>
        label="Message style"
        value={results.style}
        onChange={(style) => update({ results: { style } })}
        options={[
          { value: 'lines', label: 'Short lines' },
          { value: 'quotes', label: 'GM quotes' },
          { value: 'custom', label: 'My own' },
        ]}
      />
      {results.style === 'custom' ? (
        OUTCOMES.map((o) => (
          <label key={o.value} className="ef-field">
            <span className="ef-field__label">When I {o.value === 'win' ? 'win' : o.value === 'draw' ? 'draw' : 'lose'}</span>
            <span className="ef-focus">
              <input
                className="ef-input"
                maxLength={120}
                placeholder={EXAMPLES.lines[o.value]}
                value={drafts[o.value]}
                onChange={(e) => setDrafts((d) => ({ ...d, [o.value]: e.target.value }))}
                onBlur={() => drafts[o.value] !== results.custom[o.value] && update({ results: { custom: { [o.value]: drafts[o.value] } } })}
              />
            </span>
          </label>
        ))
      ) : (
        <ul className="ef-alert-examples" aria-label="Examples">
          {OUTCOMES.filter((o) => results[o.value]).map((o) => (
            <li key={o.value}>
              <span className="ef-alert-examples__tag">{o.label}</span> {example(o.value)}
            </li>
          ))}
        </ul>
      )}
      <label className="ef-check">
        <input type="checkbox" checked={results.followed} onChange={(e) => update({ results: { followed: e.target.checked } })} />
        <span>Also for players I follow</span>
      </label>

      <p className="ef-kicker">Before each round</p>
      <label className="ef-check">
        <input type="checkbox" checked={reminder.on} onChange={(e) => update({ reminder: { on: e.target.checked } })} />
        <span>Remind me before the round starts</span>
      </label>
      {reminder.on && (
        <>
          <Segmented<'15' | '30' | '60'>
            label="Minutes before"
            value={String(reminder.minutes) as '15' | '30' | '60'}
            onChange={(m) => update({ reminder: { minutes: Number(m) as 15 | 30 | 60 } })}
            options={[
              { value: '15', label: '15 min' },
              { value: '30', label: '30 min' },
              { value: '60', label: '1 hour' },
            ]}
          />
          <label className="ef-check">
            <input type="checkbox" checked={reminder.followed} onChange={(e) => update({ reminder: { followed: e.target.checked } })} />
            <span>Also for players I follow</span>
          </label>
          <p className="ef-help">
            Uses the round times the event publishes on chess-results, read in your time zone
            {settings.timeZone ? ` (${settings.timeZone})` : ''}. No published schedule, no reminder.
          </p>
        </>
      )}
    </Panel>
  );
}
