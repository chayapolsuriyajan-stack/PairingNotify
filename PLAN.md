# PairingNotify → mobile-first chess-results companion on Vercel

## Context

On a phone, chess-results.com is painful. Each page is a slow ASP.NET table built for
desktop. You pinch-zoom to find your own row. Every round you re-open the same three
pages: your pairing, your card and the standings. Nothing tells you when a pairing is out.

PairingNotify already fixes the alert part (scrape → diff → Web Push), but it is
limited:
- It watches one player.
- Alerts arrive 10–25 minutes late because of GitHub cron delays.
- Setup is awkward: the push subscription is pasted into a repo secret and the GitHub
  token for Fast watching sits in the browser.
- The app only shows your own pairings.

**Goal:** a Next.js app on Vercel that a player in a tournament hall can use one-handed.
It opens on "where do I sit, who do I play, which colour". It lets you browse any
tournament faster than chess-results does. It keeps everything PairingNotify does,
including polite scraping, silent seeding, bye filtering and push alerts, with alerts
arriving in about 1–2 minutes. The look follows `design.md` (Endfield industrial style:
graphite, signal yellow, chamfers, mono readouts).

**Decisions made:**
- **Users:** you plus the people you follow, with no accounts.
- **Poller:** a free external cron (cron-job.org) calls a protected `/api/poll`.
- **Stack:** Next.js App Router, with Upstash Redis (free, from the Vercel Marketplace) for state.

---

## 1. Features, from a player's point of view

### MVP (v1)

1. **Next game hero.** Opening the app shows your current pairing and nothing else:
   round, board as a huge numeral, colour, opponent name, rating and federation. If the
   round time is known, it also shows a countdown to the start.
2. **Instant alerts.** A push arrives about 1–2 minutes after a pairing is published.
   The lock-screen text reads `RD 5 · BD 12 · vs Surname (2150) · WHITE`. Tapping it
   opens that pairing in the app, not chess-results.
3. **Follow players.** Follow yourself, teammates, students or your kid. Each one gets
   their own alerts, and there is a Following tab with everyone's current board.
4. **Add a tournament in one step.** Paste any chess-results link, type a tournament ID,
   or let auto-discovery find it by name or FIDE ID. The app also accepts share-sheet
   URLs from Safari.
5. **My tournament card.** All your rounds as clean rows showing round, colour tick,
   opponent, rating, result and running score. It also shows total points, rank and
   performance.
6. **Standings.** Your row is pinned and highlighted. Search by name, and a "jump to me"
   button takes you to your row. It uses tabular mono numbers.
7. **Round pairings.** The whole round for any tournament. Search by name or club, and
   your board is highlighted at the top.
8. **Opponent scout.** Tap any opponent to see their card in this tournament (results so
   far and colours played), their FIDE ID link, and whether you have met them before in
   the tournaments the app has seen.
9. **Works in a bad-Wi-Fi hall.** The last known data is cached offline by the service
   worker, and a "SYNC 14:02" readout shows how fresh it is.
10. **Next-opponent prediction.** While the current round is being played, the app shows
    who you will most likely face next. It lists the top 3–5 candidates with
    probabilities and your likely colour. You can also switch between "If I win / draw /
    lose" to see how each result changes the list. The prediction updates on every poll
    as other boards finish. More in §3a.
11. **Degraded-mode honesty.** Keep today's "auto-discovery is down" banner and per-tournament
    errors, restyled as the hazard-stripe `SYSTEM DEGRADED` banner.

### Later (v2)

- Alerts when a result is posted and when standings move, plus a reminder 15 minutes
  before the round.
- A shareable pairing card image (Web Share API).
- Thai / English UI toggle. chess-results also supports `lan=`.
- Rating-change estimate per game (FIDE K-factor formula).

---

## 2. Screens (per `design.md` §8)

Bottom tab bar with four tabs, each at least 44px tall. The active tab has a
signal-yellow bar and inactive tabs are muted. Dark graphite is the default, with the
paper theme used when the device prefers a light scheme.

| Route | Screen | Key treatment |
|---|---|---|
| `/` | **NOW**: next-game hero for you, then compact cards for the players you follow | Chamfered hero with a 4px yellow left bar, a board numeral with a watermark round number behind it, a square `WHITE`/`BLACK` chip, and `RD 05 │ BD 12 │ 15:00` in mono. The text-scramble effect runs only when the pairing is new. |
| `/t/[id]` | **Tournament**: tabs for Pairings · Standings · My card · Info | `01 ─ TITLE` section header. Rows separated by hairlines, with a left accent bar on your row. The round picker is a segmented control. |
| `/t/[id]/next` | **NEXT (prediction)**: also shown as a card under the NOW hero during a live round | Header `04 / FORECAST`. A segmented `WIN · DRAW · LOSS` control. Candidate rows show a segmented probability bar, rating, colour tick and a one-line reason (`SAME SCORE GROUP · NOT MET · YOU DUE WHITE`). A mono line reads `BASED ON 38/42 BOARDS FINISHED`. It is always labelled `PREDICTION`, never shown as fact. |
| `/t/[id]/p/[startNo]` | **Player / opponent card** | Spec-sheet fields (`LABEL` above `Value`), rounds list, and a head-to-head note. |
| `/follow` | **Following**: list, add player, add tournament (paste URL or ID) | Status chips (`ACTIVE`, `STANDBY`, `NOT FOUND`). |
| `/settings` | Notifications on/off, test push, theme, app passcode, discovery status | Panels with section codes (`02 / NOTIFY`), and `BUILD 2026.09.19-1402` in the footer. |

**Guardrails from design.md:**
- The opponent name, board and colour must be readable in under a second.
- Body text contrast is at least 4.5:1.
- Decorative micro-text is `aria-hidden`.
- Motion is disabled under `prefers-reduced-motion`.
- Fonts are self-hosted with `font-display: swap`, using the free fallbacks Rajdhani,
  Inter and JetBrains Mono.
- No Endfield assets or branding.

---

## 3. Architecture

```
cron-job.org (every 1–2 min) ──► POST /api/poll (Bearer CRON_SECRET)
                                     │ for each followed player × tournament:
                                     │   fetchStartingRank → findPlayer → fetchPlayerCard
                                     │   diffPairings (state in Redis)
                                     │   web-push to every stored subscription
                                     ▼
                               Upstash Redis: follows, state, subscriptions, feed cache
                                     ▲
Phone PWA (Next.js) ── /api/* (passcode cookie) ── server routes proxy + cache chess-results
```

- **Reuse the backend as-is.** Move `scripts/chessresults/*`, `scripts/diff.js` and
  `scripts/notify.js` into `lib/` unchanged. Their tests move with them.
  - `client.js`: `fetchHtml`, `tournamentUrl`, the polite User-Agent and the 1.2s throttle.
  - `tournament.js`: `fetchStartingRank`, `findPlayer`, `normaliseName`.
  - `playercard.js`: `parsePlayerCard`, `fetchPlayerCard`.
  - `search.js`: `discoverTournaments`.
  - `diff.js`: `diffPairings`, which keeps the seed-silently and ignore-byes rules.
  - `notify.js`: `buildNotification`, `describePairing`.
- **`lib/poll.ts`** is `scripts/poll.js`'s `main()` refactored into
  `runPoll({ store, send })`. Instead of reading `watchlist.json` it reads follows from
  Redis, and instead of committing JSON files it writes state and the feed to Redis.
- **Discovery runs less often.** It is the expensive, fragile call, so it runs at most
  once every 30 minutes, tracked by a timestamp key. Pinned tournaments are polled on
  every tick.
- **Idle backoff.** When nothing is in an active round (every round is paired and the
  result is posted, or the last poll was under 10 minutes ago and nothing changed), the
  poll does nothing. This keeps traffic at spectator level.
- **Multiple subscriptions.** `sendPairingNotifications` changes to take a list of
  subscriptions from Redis (one per device). A 404 or 410 response deletes that
  subscription automatically instead of failing the push. This removes README step 5
  (pasting `PUSH_SUBSCRIPTION`) and the entire Fast watching PAT flow.
- **Browsing proxy.** `/api/cr/...` route handlers wrap the parsers and return JSON with
  `Cache-Control: s-maxage=60, stale-while-revalidate=300`. Everyone viewing the same
  standings then costs one chess-results request per minute.
- **New parsers**, written in the same header-alias style using `table.js` `findTable`
  and `columnIndex`: `standings.js` (ranking list) and `pairings.js` (round pairings).
  The exact `art=` values and round-schedule location must be confirmed with the existing
  `capture-fixtures` workflow before the parsers are written, and real HTML fixtures
  should be committed.
- **Protection.** There are no accounts, so an `APP_PASSCODE` env var is used: entered
  once and stored in an httpOnly cookie. It guards follows, subscriptions and settings.
  Read-only browsing can stay public.
- **Env vars:** `VAPID_PUBLIC_KEY`/`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
  `VAPID_SUBJECT`, `CRON_SECRET`, `APP_PASSCODE`, and the Upstash `KV_*` variables.
- **PWA.** Port `web/sw.js`, which already handles push display and notification click,
  to `public/sw.js`, and move the manifest and icons from `web/`. Keep the iOS "Add to
  Home Screen first" onboarding hint.

## 3a. Next-opponent prediction

- **Input data:** the tournament **crosstable**. It is one page with every player's
  opponent, colour and result for each round. It is parsed by the new
  `lib/chessresults/crosstable.js`, and its `art=` value must be confirmed with
  capture-fixtures. The live round's partial results come from the current round's
  pairings page, which `pairings.js` reads.
- **Tournament type** is read from the Info tab:
  - **Round robin:** the next opponent is exact from the Berger table. Show it as
    `CONFIRMED BY SCHEDULE`, not as a prediction.
  - **Swiss:** use `lib/predict/swiss.ts`, a simplified FIDE Dutch pairer:
    - Group players by score (downfloat the odd player to the next group).
    - In each group, pair the top half against the bottom half by rating or start rank.
    - Never pair two players who have already met.
    - Balance colours: honour an absolute preference after two in a row or a colour
      difference above 1, then prefer the colour the player is due.
    - Skip players who have withdrawn or have no result for 2 or more rounds.
- **Monte Carlo** (`lib/predict/simulate.ts`):
  - For each unfinished board, sample the result from Elo expectation plus a draw rate
    of about 30%, which can be tuned.
  - For your own board, fix the result to win, draw or loss for the scenario toggle.
  - Run the pairer, record your opponent, and repeat about 2,000 times.
  - This gives per-candidate probabilities and your colour odds. It runs in the browser
    (pure TypeScript, a few ms per run) so it costs chess-results nothing extra.
- **Honesty:** real arbiters use exact Dutch software (JaVaFo or bbpPairings) with
  acceleration and manual tweaks, so the heuristic will sometimes be wrong. Show
  probabilities rather than a single answer. After a round is paired, log whether the
  real opponent was the top pick or in the top 3, and show that hit rate on the screen
  so you can see how far to trust it.
- **Optional push:** `NEXT RD FORECAST · likely vs Surname (62%)` when your own game
  result posts. Off by default, and set in Settings.
- **Tests:**
  - Fixture crosstables with known next-round pairings (from real tournaments after the
    fact), checking that the real opponent lands in the top 3 in most cases.
  - Unit tests for no-rematch, colour rules and odd-group downfloat.
  - An exact test for round-robin Berger tables.

---

## 4. Build order

0. Commit `design.md` together with this plan saved as `PLAN.md` in the repo.
1. **Scaffold.** Next.js App Router with TypeScript in the repo root. Move the
   `scripts/` modules to `lib/`, keep `npm test` (node --test) green, and add the
   Upstash client.
2. **Design system.** Tokens from design.md §8 in `app/globals.css`, plus primitives:
   Button, Panel, Chip, Row, SectionHeader, HazardBanner and TabBar.
3. **Poll API.** `/api/poll` with `runPoll`, the Redis store and multi-subscription
   push. Add a `?dryRun=1` mode that mirrors today's `--dry-run`.
4. **NOW screen + Follow flow.** Add player, add tournament via URL or ID, subscribe to
   push, and send a test push.
5. **Tournament screens.** Capture fixtures, then write and test the standings and
   pairings parsers, then build the Pairings, Standings and My card tabs.
6. **Opponent scout and offline caching.**
6a. **Prediction.** Crosstable parser, then round-robin Berger, then the Swiss heuristic
    pairer, then Monte Carlo, then the NEXT screen and the hit-rate log.
7. **Retire the old pieces.** Delete `web/`, `poll.yml`, `watch.yml`, `pages.yml` and
   `data/`. Keep `capture-fixtures.yml`. Rewrite the README setup around Vercel and
   cron-job.org.

## 5. Verification

- `npm test`: the existing 22 tests pass after the move, plus new fixture tests for the
  standings and pairings parsers and a `runPoll` test with an in-memory store and a fake
  sender. That test covers seeding with no push, a new round producing a push, a bye
  producing no push, and a 410 response deleting the subscription.
- `vercel dev`: call `curl -X POST localhost:3000/api/poll?dryRun=1 -H "Authorization: Bearer $CRON_SECRET"` and
  check the log shows your tournaments, start numbers and rounds.
- Deploy a preview, install it to the Home Screen on an iPhone, enable notifications,
  press **Send test push** and confirm it appears on the lock screen.
- Point cron-job.org at production. During a live tournament, confirm the alert arrives
  within about 2 minutes of the pairing appearing on chess-results.
- Check the mobile UI in the browser pane at 375px in both themes: no horizontal scroll,
  tap targets at least 44px, and hero text readable at arm's length.

---

## Status (2026-09-19): built

All steps 0–7 are implemented. Deviations from the plan, and why:

- **The old parsers were broken on real pages.** The synthetic fixtures didn't match real
  markup (a layout table wraps the page; colour is a `FarbewT/FarbesT` div inside the
  result cell), and the FIDE-ID column only exists on `art=0`. Tables are now read by
  their own rows and cells, and every parser is tested against real pages captured
  2026-09-19.
- **Auto-discovery never worked.** The search form has separate surname and first-name
  fields. It is now fixed, searches by FIDE ID when one is set, and keeps only current
  events.
- **Confirmed page types:** `art=0` starting rank, `art=1&rd=N` standings, `art=2&rd=N`
  pairings, `art=5` crosstable plus details, `art=9` player card, `art=14` schedule.
- **Forecast accuracy** is measured, not assumed: 45–66% exact opponent when replaying
  real events, and 33% exact / 50% top-3 / 89% colour in a live out-of-sample check. The
  per-event track record comes from replaying that event's own rounds rather than from
  a stored hit log.
- **A poll lock** in the store stops a cron tick and a "follow added" refresh from both
  pushing the same pairing.
- The VAPID public key is served from `/api/config`, so no `NEXT_PUBLIC_` rebuild is needed.
