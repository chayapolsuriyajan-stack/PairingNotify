# Fixtures

**`real-*.html` / `live-*.html` are genuine chess-results pages** (captured 2026-09-19).
They are what the parser tests in `pages.test.js` run against:

| File | Page | Source |
|---|---|---|
| `real-starting-rank.html` | art=0 (has the FIDE ID column) | BCC Blitz 18 September 2026, tnr1499564 (finished, 9 rounds) |
| `real-player-card.html` | art=9, start no. 12 | same |
| `real-standings-rd5.html` | art=1&rd=5 | same |
| `real-pairings-rd6.html` | art=2&rd=6 (includes a bye and not-paired rows) | same |
| `real-crosstable-final.html` | art=5 starting-rank crosstable + tournament details | same |
| `real-schedule.html` | art=14 | same |
| `live-crosstable-rd2.html` | art=5 captured mid round 2 of 6 (pending games) | Unisus The Street Open, tnr1486488 |
| `live-pairings-rd2.html` | art=2&rd=2, no results yet | same |
| `live-schedule.html` | art=14 | same |

`synthetic-*.html` are hand-written approximations kept for the older tests. They
turned out **not** to match real markup: the real page wraps everything in a layout
table and puts the colour marker (`div.FarbewT` / `div.FarbesT`) inside the result cell.
Trust the real fixtures over them.

To refresh or add fixtures, run the **Capture chess-results fixtures** workflow (or
fetch the page yourself with the project's User-Agent) and save it here.
