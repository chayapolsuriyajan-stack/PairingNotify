# PairingNotify

A phone-first companion for [chess-results.com](https://chess-results.com), for players
who are tired of pinch-zooming ASP.NET tables between rounds.

- **Your next game on one screen**: board number, your colour, opponent and rating,
  plus a countdown to the round.
- **Lock-screen alert** about 1–2 minutes after a pairing is published, for you and for
  anyone you follow (teammates, students, your kid).
- **Tournament pages that work on a phone**: round pairings with your board pinned,
  standings with your row pinned, your card, and the event details.
- **Opponent scout**: their card in this event, their FIDE profile, and any earlier
  games you've played against them.
- **Next-opponent forecast** while your round is still being played, including
  "if I win / draw / lose" (see [How good is the forecast?](#how-good-is-the-forecast)).
- **Works in a hall with bad Wi-Fi**: the last data you loaded stays available offline.

The look follows [`design.md`](design.md): an industrial "field terminal" style with
graphite, signal yellow and mono readouts. It uses dark mode by default and switches to
light automatically when your phone is in light mode.

```
cron-job.org (every 1–2 min) ──► /api/poll ──► chess-results ──► diff ──► Web Push ──► phones
                                     │
                                     └──► Upstash Redis (follows, devices, state, feed)
phone (PWA) ──► /api/* ──► cached chess-results proxy (1 request/min per page, shared)
```

---

## Setup (about 15 minutes)

### 1. Deploy to Vercel

Import this repository in Vercel. You can keep the default settings.

### 2. Add storage

In the Vercel project, open **Storage → Marketplace → Upstash Redis** and connect it (the
free tier is plenty). This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` for you.

### 3. Set environment variables

Settings → Environment Variables:

| Variable | Value |
|---|---|
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | from `npx web-push generate-vapid-keys` |
| `VAPID_SUBJECT` | `mailto:you@example.com` |
| `CRON_SECRET` | any long random string (`openssl rand -hex 32`) |
| `APP_PASSCODE` | a long passcode, entered once per device |

Redeploy after setting them.

### 4. Schedule the poller

Create a free job on [cron-job.org](https://cron-job.org):

- **URL:** `https://<your-app>.vercel.app/api/poll`
- **Schedule:** every 1 minute (or every 2 minutes)
- **Advanced → Headers:** `Authorization: Bearer <CRON_SECRET>`

Why cron-job.org? Vercel's own cron needs the Pro plan to run more than once a day.
cron-job.org is free, and polling every 1–2 minutes is what gets alerts down from the
old 10–25 minutes to 1–2 minutes.

### 5. Install on your phone

- **iPhone:** open the site in Safari → Share → **Add to Home Screen**, then open
  **Pairings** from the Home Screen. iOS only allows web push from Home Screen apps.
- **Android:** Chrome → **Install app**.

### 6. First run

1. Enter your passcode.
2. **Follow** → *Add yourself*: your name exactly as chess-results writes it
   (`Surname, Given`) or your FIDE ID, and optionally the tournament link. Tick
   *This is me*.
3. **Settings** → *Enable alerts* → *Send test alert*.

A new player's existing rounds are recorded silently. You only get alerts for rounds
paired after you start following, never a burst of old ones.

---

## How good is the forecast?

Real pairings are made by the arbiter's software (FIDE Dutch system), and they are also
affected by withdrawals, late entries and requested byes that nobody announces in
advance. So the app shows **odds, not a promise**, and always labels them as a prediction.

The forecast works in three steps:
1. It simulates the unfinished boards from the players' ratings.
2. It pairs the next round with a simplified Dutch pairer.
3. It repeats this a few hundred times and counts how often each opponent comes up.

Round robins are read straight from the Berger tables.

Measured on real events (checked 2026-09-19):

| Test | Exact opponent | Opponent in top 3 | Colour |
|---|---|---|---|
| Replaying a 65-player rapid (rounds 2–5) | 66% | — | — |
| Replaying a 31-player blitz with many dropouts (rounds 2–9) | 45% | — | — |
| **Live**: predicted mid-round-2, checked against the real round 3 (18 players) | 33% | 50% | 89% |

Each event page shows the model's hit rate on that event's own earlier rounds, so you
can see how much to trust it there.

---

## Being polite to chess-results

chess-results is a small, volunteer-run service with no API. This app:

- identifies itself with a descriptive `User-Agent` and spaces requests 1.2 s apart,
  backing off on errors;
- caches your start number, so a normal poll is **one request per followed player**;
- polls quiet events less often: every tick while active, every 15 minutes after 6
  quiet hours, and every 6 hours after 3 days;
- runs auto-discovery at most every 30 minutes, and only keeps events that are current;
- serves browsing through a CDN-cached proxy, so everyone viewing the same standings
  costs chess-results one request per minute.

Please keep it that way if you change the intervals.

---

## When it breaks

chess-results can change its markup without warning. All the parsers live in
`lib/chessresults/`, read columns **by header name**, and are tested against real
captured pages.

| Symptom | Where to look |
|---|---|
| "Auto-discovery degraded" banner | `lib/chessresults/search.js`. Tournaments added by link keep working. |
| `No table found with columns …` | A column heading changed. Add the new heading to the alias list in the matching parser. |
| No alerts, but data updates | Settings → *Send test alert*. Dead devices (HTTP 404/410) are removed automatically; re-enable alerts on that phone. |
| Nothing updates at all | Check cron-job.org's history for `/api/poll` (401 means `CRON_SECRET` doesn't match). |
| Wrong player matched | Add the FIDE ID on the Follow tab. |

To check the parsers against today's markup:

```bash
npm run capture -- --tournament 1486488 --name "Surname, Given"
```

It downloads each page type, runs every parser on it, prints `PARSE OK` / `PARSE FAIL`,
and saves the HTML in `lib/__fixtures__/captured/`. It also runs as the manual *Capture
chess-results fixtures* GitHub Action.

---

## Local development

```bash
npm install
npm run dev        # http://localhost:3000, in-memory store, no passcode, poll open
npm test           # node --test, fully offline (real captured pages as fixtures)
npm run typecheck
```

To run one poll by hand without sending anything:

```bash
curl "http://localhost:3000/api/poll?dryRun=1"
```

`/design` (development only) shows every UI component.

## Layout

```
app/                    Next.js routes: screens and /api
  api/poll              the poller, called by cron
  api/cr/[id]/…         cached chess-results proxy (overview, pairings, standings, player)
components/             screens and UI primitives (components/ui)
lib/chessresults/       polite HTTP client + parsers (one per page type)
lib/predict/            Swiss model, Berger tables, forecast / Monte Carlo
lib/poll.js             one poll tick: discover → observe → diff → push → feed
lib/diff.js             which pairings are new (seeds silently, ignores byes)
lib/notify.js           lock-screen copy + multi-device web push
lib/store/              Upstash Redis store (in-memory fallback for development)
server/                 passcode session, cron auth, proxy caching
public/sw.js            service worker: push display + offline copy
```
