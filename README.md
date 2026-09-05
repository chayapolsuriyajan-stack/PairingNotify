# PairingNotify

Watches [chess-results.com](https://chess-results.com) for your next pairing and pushes it
to your phone's lock screen — **round, board, opponent name, opponent rating** — plus a
small full-screen web app you add to your Home Screen.

No servers. GitHub Actions does the polling, GitHub Pages hosts the app.

```
Actions cron ──► chess-results ──► diff vs last state ──► Web Push ──► your phone
     │
     └──► data/pairings.json ──► GitHub Pages ──► the Home Screen app
```

---

## What to expect before you set it up

- **Alerts arrive within roughly 10–25 minutes of a pairing being published**, not
  instantly. GitHub's scheduled workflows have a 5-minute floor and are regularly delayed
  another 5–20 minutes. If you need to know within seconds, this design cannot do it —
  that needs an always-on server.
- **On iPhone, push only works after you Add to Home Screen.** This is an iOS rule for all
  web apps, not a limitation of this project. Opening the site in a Safari tab will never
  produce a notification.
- **chess-results has no API.** Everything here is scraped from an ASP.NET site that can
  change without warning. The parsers are isolated in `scripts/chessresults/` and covered
  by tests so a break is a small fix; see [When it breaks](#when-it-breaks).

---

## Setup

### 1. Fork/clone and enable Pages

Settings → Pages → **Source: GitHub Actions**.

> Keeping the repo **public** is recommended. Pages on a private repo needs GitHub Pro, and
> nothing here is sensitive — pairings and ratings are already public on chess-results.
> Your VAPID private key and push subscription live in Actions secrets, which stay private
> even in a public repo.

### 2. Tell it who you are

Edit `watchlist.json`:

```jsonc
{
  "playerName": "Suriyajan, Chayapol",  // as it appears on chess-results
  "fideId": "6200456",                  // optional but strongly recommended
  "autoDiscover": true,                 // search chess-results for your tournaments
  "tournaments": [                      // pinned tournaments, always polled
    { "id": "1146458", "label": "Bangkok Open 2026", "enabled": true }
  ]
}
```

Set `fideId` if you have one. Name matching is accent- and order-insensitive, but two
players sharing a surname will make the run stop with a clear error rather than guess.

### 3. Generate VAPID keys

```bash
npx web-push generate-vapid-keys
```

- Paste the **public** key into `VAPID_PUBLIC_KEY` at the top of `web/app.js` and commit it.
  It is public by design.
- Add these repository secrets (Settings → Secrets and variables → Actions):

  | Secret | Value |
  |---|---|
  | `VAPID_PUBLIC_KEY` | the public key |
  | `VAPID_PRIVATE_KEY` | the private key — **never commit this** |
  | `VAPID_SUBJECT` | `mailto:you@example.com` |

### 4. Install the app on your phone

Open your Pages URL in Safari → Share → **Add to Home Screen** → open **Pairings** from the
Home Screen (not from Safari).

### 5. Turn on notifications

In the app, tap **Enable notifications**, allow the prompt, then copy the JSON it shows and
save it as the repository secret `PUSH_SUBSCRIPTION`.

This is a one-time manual step, and it is deliberate: a push subscription is effectively a
bearer credential — anyone holding it can push notifications to your phone — so it belongs
in a secret, never in the repo. With no backend there is nowhere else to put it.

### 6. Confirm it works

Actions → **Poll chess-results** → *Run workflow* with **dry run** ticked. The log should
show your tournaments, your start number, and the rounds it parsed. Then untick dry run and
run it for real.

---

## Verifying the scrape against the live site

`chess-results.com` may be unreachable from your development machine, and its exact URL
parameters are not documented. Use the runner instead:

Actions → **Capture chess-results fixtures** → run it with a tournament id and your name.

It downloads the raw HTML, runs every parser against it, and prints `PARSE OK` / `PARSE
FAIL` per parser. Download the artifact and commit the HTML into `scripts/__fixtures__/` as
`real-*.html` so future changes are tested against genuine markup.

---

## When it breaks

| Symptom | Where to look |
|---|---|
| "Auto-discovery is down" banner in the app | `scripts/chessresults/search.js`. The app keeps working on pinned tournaments — add yours to `watchlist.json` and you lose nothing. |
| `No table found with columns …` | Column headings changed. Add the new heading to the alias lists in `playercard.js` / `tournament.js`. |
| Notifications stop, log says HTTP 410 | Subscription expired (usually a reinstall). Redo step 5. |
| Nothing runs for weeks | GitHub disables scheduled workflows after 60 days of repository inactivity. Push any commit, or run the workflow manually, to re-arm it. |
| Wrong player matched | Set `fideId` in `watchlist.json`. |

The parsers read columns **by header name**, not by position, so an added or reordered
column does not break them. That is the main reason to fix parsers here rather than
rewriting them.

---

## Local development

```bash
npm install
npm test               # 22 tests, fully offline
npm run poll -- --dry-run
```

`--dry-run` parses and diffs but sends no push and writes no files.

## Layout

```
watchlist.json              who and what to watch
scripts/
  poll.js                   the whole backend, run by Actions
  diff.js                   which pairings are new (seeds silently, ignores byes)
  notify.js                 web-push sending
  chessresults/
    client.js               polite HTTP: identifies itself, throttles, backs off
    table.js                header-name-driven table reading
    playercard.js           art=9 -> round / board / opponent / rating / colour
    tournament.js           starting rank -> your start number
    search.js               auto-discovery (the fragile part, always optional)
web/                        the PWA served by Pages
data/                       pairings.json (the feed) + state.json (what we've seen)
```

## A note on scraping politely

chess-results is a small, volunteer-run service. This client identifies itself with a
descriptive `User-Agent`, serialises requests ~1.2s apart, backs off on failure, and fetches
each tournament at most once per run — a handful of requests every ten minutes. Please keep
it that way if you change the polling interval.
