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

- **Normal alerts arrive within roughly 10–25 minutes of a pairing being published.**
  GitHub's scheduled workflows have a 5-minute floor and are regularly delayed another
  5–20 minutes. There's an optional [Fast watching](#fast-watching-near-instant-alerts)
  mode that gets this down to ~20–30 seconds — see that section.
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

## Fast watching: near-instant alerts

The 10–25 minute latency above comes entirely from *when the poller runs at all*, not from
the code. `watch.yml` fixes that by running one long GitHub Actions job that loops
internally — poll, diff, push, sleep 20s, repeat — for ~5h40m, then re-triggers itself so
the loop keeps going. Latency drops to about the polling interval: **~20–30 seconds**.
Polling chess-results every 20s during an active round is normal spectator traffic, not
abuse.

You start and stop it with the **Fast watching** button in the app. Because a static page
can't hold a secret, that button needs a GitHub token in the browser to call the Actions
API directly — this is a real, deliberate tradeoff for a personal single-user tool, not an
oversight:

- The token is a **fine-grained PAT scoped to only this repository**, with **Actions: Read
  and write** and nothing else. It cannot touch any other repo or do anything beyond
  starting/stopping this one workflow.
- It lives in this device's `localStorage` only — never committed, never sent anywhere
  except `api.github.com`.
- Compare this to the alternative of adding a real backend (a Cloudflare Worker, a VPS) just
  to hide this token server-side — that reintroduces the "no servers" tradeoff this project
  was built to avoid, for a token whose blast radius is already capped to one repo's Actions.

### Setup

1. **Create the token**: [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new)
   → Repository access: **Only select repositories** → this repo → Permissions →
   **Actions: Read and write**. Give it an expiry you're comfortable renewing later.
2. **Add repo secret `WATCH_DISPATCH_PAT`** with that same token. This is what lets
   `watch.yml` re-trigger itself across the ~6-hour job limit — GitHub deliberately blocks
   the built-in `GITHUB_TOKEN` from doing this, specifically to stop workflows from
   accidentally re-triggering themselves forever, so a real PAT is required here.
3. **In `web/app.js`**, check `REPO_OWNER` / `REPO_NAME` / `REPO_REF` at the top match your
   fork and branch (`REPO_REF` is whatever branch `watch.yml` lives on — update it if you
   later merge onto your default branch).
4. **In the app**, paste the same token into the Fast watching panel once. It's stored per
   device — do this again on any other phone/browser you use to start/stop it.

### Using it

Tap **Start watching** right before your round. It covers up to ~23 hours via its own
re-chaining (4 links × ~5h40m) before stopping itself as a safety net — tap Start again if
you're still playing after that. Tap **Stop watching** when you're done; this cancels the
running job, which is what actually breaks the re-chain (a cancelled job skips its
re-trigger step). Leaving it running costs nothing on a public repo — GitHub-hosted Actions
runners are free/unlimited there — but stopping it when you're not playing is still good
hygiene.

### An assumption I could not verify

The Fast watching button calls `api.github.com` directly from the browser, which only works
if GitHub's REST API sends CORS headers on these specific endpoints (workflow dispatch,
run listing, run cancellation). I could not confirm this from the sandbox this was built
in — its own network proxy intercepts `api.github.com` and returns a synthetic error before
the request ever reaches GitHub, so every CORS test I ran was testing my own mock, not the
real API. **Please verify this yourself as the first thing you do**: open the app, paste
your token, tap Start watching, and check whether it works. If your browser's console shows
a CORS error instead, the fallback is to start/stop `watch.yml` from the Actions tab on
GitHub directly (a "Run workflow" button gets you the same result, just without the app
UI) — the workflow itself doesn't depend on the button at all.

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
| Fast watching button says "Could not reach GitHub" | Likely CORS (see [Fast watching](#fast-watching-near-instant-alerts)) or an expired token. Use the Actions tab directly as a fallback. |
| Fast watching stopped re-chaining after one link | `WATCH_DISPATCH_PAT` secret is missing/expired, or you hit the 4-link safety cap — check the last `watch.yml` run's "Chain to the next link" step log. |

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
  watch.js                  fast-poll loop for watch.yml (Fast watching)
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
