'use client';

import { useEffect, useState } from 'react';
import { Button, Chip, HazardBanner, Panel } from '@/components/ui';
import { PasscodeGate } from '@/components/PasscodeGate';
import { TopBar } from '@/components/TopBar';
import { useAccount } from '@/components/useAccount';
import { currentSubscription, isIos, isStandalone, pushSupport, subscribe, unsubscribe } from '@/components/push';

type PushState = 'loading' | 'on' | 'off' | 'needs-install' | 'unsupported' | 'blocked';

/** SETTINGS: notifications for this device, access, and server status. */
export default function SettingsPage() {
  const { config, needsLogin, unlock } = useAccount({ refreshMs: 0 });
  const [push, setPush] = useState<PushState>('loading');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ios, setIos] = useState(false);

  async function refreshPush() {
    const support = pushSupport();
    if (support !== 'supported') return setPush(support);
    if (Notification.permission === 'denied') return setPush('blocked');
    setPush((await currentSubscription().catch(() => null)) ? 'on' : 'off');
  }

  useEffect(() => {
    setIos(isIos() && !isStandalone());
    refreshPush();
  }, []);

  async function run(action: () => Promise<string | void>) {
    setBusy(true);
    setMessage(null);
    try {
      const result = await action();
      if (result) setMessage(result);
    } catch (error) {
      setMessage((error as Error).message);
    }
    setBusy(false);
    refreshPush();
  }

  const vapid = config.data?.vapidPublicKey;

  return (
    <main className="ef-page">
      <TopBar caption="AIC // CONFIGURATION" title="Settings" />
      {needsLogin && <PasscodeGate onUnlocked={unlock} />}

      {!needsLogin && config.data && (
        <>
          <Panel
            code="02 / NOTIFY"
            title="Alerts on this device"
            status={
              <Chip tone={push === 'on' ? 'ok' : push === 'off' || push === 'loading' ? 'neutral' : 'alert'}>
                {push === 'on' ? 'Active' : push === 'off' ? 'Standby' : push === 'loading' ? '…' : 'Unavailable'}
              </Chip>
            }
            serial="AIC-PN-PUSH"
          >
            {push === 'needs-install' && (
              <p className="ef-help">
                On iPhone, alerts only work from the Home Screen app: tap Share, then <strong>Add to Home Screen</strong>,
                then open <strong>Pairings</strong> from there and come back here.
              </p>
            )}
            {push === 'unsupported' && <p className="ef-help">This browser can&apos;t receive web push alerts.</p>}
            {push === 'blocked' && (
              <p className="ef-help">Notifications are blocked for this app. Allow them in your phone&apos;s settings.</p>
            )}
            {!vapid && (
              <HazardBanner label="Server not set up">
                VAPID keys are missing on the server, so alerts can&apos;t be sent yet. See the README.
              </HazardBanner>
            )}
            {push === 'off' && vapid && (
              <>
                <p className="ef-help">Get a lock-screen alert the moment a new pairing is published.</p>
                <Button arrow disabled={busy} onClick={() => run(() => subscribe(vapid))}>
                  Enable alerts
                </Button>
              </>
            )}
            {push === 'on' && (
              <div className="ef-actions">
                <Button
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const response = await fetch('/api/push/test', { method: 'POST' });
                      const body = await response.json().catch(() => ({}));
                      if (!response.ok) throw new Error(body.error ?? 'Test failed');
                      return `Sent to ${body.sent} device(s).`;
                    })
                  }
                >
                  Send test alert
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => run(unsubscribe)}>
                  Turn off
                </Button>
              </div>
            )}
            {message && <p className="ef-help">{message}</p>}
          </Panel>

          {ios && push !== 'needs-install' && (
            <Panel code="03 / INSTALL" title="Add to Home Screen">
              <p className="ef-help">
                For the full-screen app and reliable alerts, tap Share, then <strong>Add to Home Screen</strong>.
              </p>
            </Panel>
          )}

          <Panel code="04 / ACCESS" title="Passcode">
            {config.data.passcodeRequired ? (
              <>
                <p className="ef-help">This device is unlocked. Sign out to lock your follows and alerts again.</p>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    await fetch('/api/session', { method: 'DELETE' });
                    config.reload();
                  }}
                >
                  Sign out
                </Button>
              </>
            ) : (
              <p className="ef-help">
                No passcode is set, so anyone with the link can change your follows. Set <code>APP_PASSCODE</code> on
                the server to lock it.
              </p>
            )}
          </Panel>

          <Panel code="05 / SYSTEM" title="Server" serial={`STORE ${config.data.storage.toUpperCase()}`}>
            <dl className="ef-spec">
              <div className="ef-spec__item ef-spec__item--wide">
                <dt>Storage</dt>
                <dd>
                  {config.data.storage === 'redis' ? 'Upstash Redis' : 'In memory (local development only, resets on restart)'}
                </dd>
              </div>
              <div className="ef-spec__item ef-spec__item--wide">
                <dt>Poller</dt>
                <dd>{config.data.cronConfigured ? 'CRON_SECRET set: cron-job.org can call /api/poll' : 'CRON_SECRET missing: nothing polls in production'}</dd>
              </div>
              <div className="ef-spec__item ef-spec__item--wide">
                <dt>Alerts</dt>
                <dd>{vapid ? 'VAPID keys set' : 'VAPID keys missing'}</dd>
              </div>
            </dl>
          </Panel>
        </>
      )}
    </main>
  );
}
