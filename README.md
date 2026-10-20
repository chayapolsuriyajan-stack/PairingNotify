# PairingNotify

A phone-first companion for [chess-results.com](https://chess-results.com), for players
who are tired of pinch-zooming ASP.NET tables between rounds.

- **Your next game on one screen**: board number, your colour, opponent and rating,
  plus a countdown to the round.
- **Lock-screen alert** about 1–2 minutes after a pairing is published, for you and for
  anyone you follow (teammates, students, your kid).
- **Result alerts** after each game, with a line to match (short lines, famous players'
  quotes, or your own words; on/off per win, draw and loss), and a **round reminder**
  15, 30 or 60 minutes before a scheduled round. Settings → *Results & reminders*.
- **Invite friends**: each invite code makes a separate account (see
  [Inviting friends](#inviting-friends)).
- **Tournament pages that work on a phone**: round pairings with your board pinned,
  standings with your row pinned, your card, and the event details.
- **Opponent scout**: their card in this event, their FIDE profile, and any earlier
  games you've played against them.
- **Rating change per game** on every card (FIDE formula), adding up to the official
  total once chess-results publishes it.
- **Next-opponent forecast** while your round is still being played, including
  "if I win / draw / lose" (see [How good is the forecast?](#how-good-is-the-forecast)).
- **Works in a hall with bad Wi-Fi**: the last data you loaded stays available offline.
- **Lichess study renamer** (Events tab → Tools, or `/pgn`): rewrites every chapter of a
  study to "opponent + score" before you import it into a new study: paste the study
  link, or its exported PGN. See
  [Renaming a Lichess study](#renaming-a-lichess-study).

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
| `SESSION_SECRET` | optional: signs session cookies; if unset, `APP_PASSCODE` is used (changing it signs everyone out) |

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

### Inviting friends

Settings → **Invite people** → *Generate invite* makes a code like `K7QM-3XTP` and opens
your phone's share sheet. Whoever enters it on the sign-in screen gets **their own
account**: their own follows, devices and alerts, which you don't see (and they don't
see yours). The code then stays their sign-in code for their other devices; they can
swap it in Settings, unused codes expire after a week, and you can remove an account
(and everything in it) from the same panel. Everyone shares one poller and one page
cache, so two people following the same player cost chess-results one request.

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

Measured with `npm run bench` on 52 finished Swiss events, 270 rounds (2026-10-18):

| Event size | Pairing, all results in | Top 3, your game over | Top 3, nothing finished yet |
|---|---|---|---|
| Small (under 20) | 78% | 77% | 75% |
| Medium (20–59) | 70% | 57% | 47% |
| Large (60+) | 75% | 39% | 30% |
| **All** | **74%** | **54%** | **46%** |

- *Pairing, all results in*: once the round's results are all in, the share of players
  whose real opponent the pairer predicted exactly (colour right on 99.9% of those).
- *Top 3*: while the round before is still being played, how often the real opponent is
  in the forecast's top 3. It climbs during the round as results come in.

The forecast reads the live round's pairings page as well as the crosstable, because
arbiters enter results there first. `npm run bench` keeps the downloaded crosstables in
`.cache/bench/`, so you can re-run it for free after changing the model, and
`--json out.json` writes the numbers so you can compare before and after.

Each event page shows the model's hit rate on that event's own earlier rounds, so you
can see how much to trust it there.

---

## Renaming a Lichess study

A study export names each chapter in its `[Event]` tag ("Study: Chapter"). The renamer
(`/pgn`, linked from the Events tab) rewrites that tag to `<Opponent> <Score>`, with the
score from **your** side (`1-0` = you won), so the chapters read well after you import the
PGN into a new study. Paste the study link (public or unlisted studies load straight from
Lichess) or the exported PGN; the renaming itself runs in your browser.

Where the opponent and score come from, per field, first match wins:

1. `[White]`/`[Black]` when one of them is your Lichess username (a `*` result is ignored);
2. the opponents and results from chess-results, matched to games in order. Pick a
   tournament of a player you follow (yours first) and they fill in by themselves, each
   with a **Their page** link to that opponent in the same event; or choose *Another
   tournament…* with a player-card link, or switch to *Paste rows*. Editing an opponent
   removes its link, since it would no longer point at them;
3. the existing chapter name, `Viriya 1-0` (the `Study: ` prefix is stripped);
4. a result comment at the end of the moves, `{ 1-0 }`.

Study exports often have no player tags and `[Result "*"]` everywhere, which is why the
chess-results rows exist. Scores read from a chapter name or a comment are taken as already
being yours, since neither says which colour you had. Every value is editable before you
copy or download; a chapter still missing its opponent or score keeps its original name and
is flagged. When sources disagree on a score, the row says so.

Only the `[Event]` tag (and `[ChapterName]`, which you can switch off) changes: moves,
comments, variations, NAGs, every other tag, blank lines and line endings stay as they were,
and `lib/__tests__/pgn.test.js` checks that line by line. The name template (default
`{opponent} {score}`), name order (`First Last` or `Last, First`) and your username are
remembered on the device.

---

## Being polite to chess-results

chess-results is a small, volunteer-run service with no API. This app:

- identifies itself with a descriptive `User-Agent` and spaces requests 1.2 s apart,
  backing off on errors;
- caches your start number, so a normal poll is **one request per followed player**;
- polls quiet events less often: every tick while active, every 15 minutes after 6
  quiet hours, and every 6 hours after 3 days;
- searches for a player's new events once a day, or every 30 minutes while they have an
  event that moved today, and only keeps events that are current;
- reads the start number straight out of the search result's own link, so a discovered
  event costs one request instead of two;
- deletes an event from the app (pinned or found) once nothing has changed on it for two
  weeks and no scheduled round is left, so it stops being polled at all;
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
| Nothing updates at all / *Alerts paused* banner | The poller stopped: check cron-job.org's history for `/api/poll` (401 means `CRON_SECRET` doesn't match). You also get an *Alerts paused* push after 10 quiet minutes, and *Alerts are back on* once it runs again; Vercel checks once a day too (`/api/watchdog`). |
| Wrong player matched, or a player not found | Add the FIDE ID on the Follow tab: the search uses it first and falls back to the name. |
| Notification badge is a blank white square | Android fills the badge's alpha channel with one colour, so it must be a transparent monochrome shape: `node scripts/make-badge.mjs`. |

To check the parsers against today's markup:

```bash
npm run capture -- --tournament 1486488 --name "Surname, Given"
```

It downloads each page type, runs every parser on it, prints `PARSE OK` / `PARSE FAIL`,
and saves the HTML in `lib/__fixtures__/captured/`. The *Capture chess-results fixtures*
GitHub Action runs it every Monday (a failed parser fails the run, and GitHub emails you),
and you can run it by hand on any event.

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
lib/pgn/                Lichess study renamer: PGN splitting/renaming, chess-results row paste
lib/poll.js             one poll tick: discover → observe → diff → push → feed
lib/diff.js             which pairings are new (seeds silently, ignores byes)
lib/notify.js           lock-screen copy + multi-device web push
lib/store/              Upstash Redis store (in-memory fallback for development)
server/                 passcode session, cron auth, proxy caching
public/sw.js            service worker: push display + offline copy
```
