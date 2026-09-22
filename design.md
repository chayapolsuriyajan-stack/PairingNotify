# Design: Arknights: Endfield UI and theme analysis

What Arknights: Endfield (Hypergryph / Gryphline, 2026) does visually, and how to
bring that language into PairingNotify without copying game assets or branding.

> Hex values are approximations taken from screenshots, not official tokens.
> Fonts are the ones identified by GameFontLibrary. Use them as a starting
> point and adjust by eye.

---

## 1. Core idea: industrial field equipment

Endfield's interface looks like software on an industrial terminal used by a
frontier engineering company. The game calls this system the AIC (Automated
Industry Complex). Every screen should feel like a spec sheet, a control panel,
or a shipping label, and never like a fantasy game menu.

Three words sum it up: **clinical, engineered, labelled.**

| Pillar | What it means on screen |
|---|---|
| Industrial utility | Right angles, 1px rules, visible grids, hazard markings. Nothing looks soft. |
| Information density as decoration | Tiny serial codes, coordinates, unit labels and section numbers fill empty space. Metadata does the ornamenting. |
| Restraint plus one loud colour | Neutrals take up about 90% of the screen. One saturated accent (signal yellow) marks what matters. |
| Light-first | Unlike most gacha UIs, many Endfield menus use off-white or pale grey panels with black type, like printed documentation. Dark screens are kept for the HUD and cinematic moments. |

---

## 2. Colour

### Palette (approximate)

| Role | Token | Hex | Notes |
|---|---|---|---|
| Paper (light surface) | `--ef-paper` | `#E9E9E6` | Warm off-white, slightly grey. Never pure `#FFF`. |
| Paper raised | `--ef-paper-2` | `#F4F4F2` | Cards on top of paper. |
| Ink | `--ef-ink` | `#141414` | Near-black text and solid blocks. |
| Graphite (dark surface) | `--ef-graphite` | `#1B1C1E` | HUD and dark-mode base. |
| Graphite raised | `--ef-graphite-2` | `#26282B` | Panels on dark. |
| Rule | `--ef-rule` | `#9A9C9E` at 40–60% | Hairlines, grid lines. |
| Muted text | `--ef-muted` | `#6E7073` (light) / `#8E9196` (dark) | Captions, micro-labels. |
| **Signal yellow** | `--ef-signal` | `#FFE500` | The signature accent: selection, primary CTA, active state, hazard stripes. |
| Cyan (secondary) | `--ef-cyan` | `#34D6E0` | System/info readouts, links, "online" states. Use sparingly. |
| Alert orange-red | `--ef-alert` | `#FF5A36` | Warnings, errors, destructive actions. |
| Success green | `--ef-ok` | `#9BDB4D` | Rare. Confirmations only. |

### Rules

- **Signal yellow is a highlighter, not a theme colour.** Use it for one or two
  things per screen: the active item and the primary action. Never use it for
  large backgrounds except a thin full-width strip or a CTA block.
- Text on yellow is always ink (`#141414`). Yellow text only works on graphite.
- Rarity and element colours (the orange, purple and blue tiers) are separate
  from UI chrome. Keep content colour apart from interface colour.
- Low-opacity tints (grid lines, watermark numerals) should be monochrome,
  about 4–10% alpha of ink or paper.

---

## 3. Typography

| Layer | Game font | Web fallback / free alternative | Use |
|---|---|---|---|
| Display / headers | **Novecento Sans** (wide, geometric, all-caps) | `"Novecento Sans"`, `"Rajdhani"`, `"Oxanium"`, `"Barlow Condensed"` | Screen titles, section headers, big numbers, labels on buttons. Always uppercase and tracked out. |
| Body / UI text | **HarmonyOS Sans** | `"HarmonyOS Sans"`, `"Inter"`, system-ui | Names, descriptions, anything read as a sentence. Sentence case. |
| Data / micro | **Iosevka** (narrow monospace) | `"Iosevka"`, `"JetBrains Mono"`, ui-monospace | Serial codes, timestamps, coordinates, ratings, tabular figures. |

### Type rules

- **Uppercase and wide tracking for chrome**: `letter-spacing: 0.08em–0.2em` on
  headers and labels. Body text keeps normal tracking.
- **Pairing of a big word with a tiny caption**: a large uppercase title nearly
  always has a 9–11px mono caption above or below it, such as a section code
  (`01 / PAIRING`), an English subtitle, or a status line.
- **Numbers carry the hierarchy.** Big, light-weight, tabular numerals (round
  number, board number, rating) are the focal points, often larger than the
  text next to them.
- Weights are limited: regular and bold for display, regular and medium for
  body. Avoid mid-heavy weights like 650.
- Micro-labels can go down to 9–10px. Since they are decorative metadata, it is
  fine for them to be low contrast, but they must never carry essential
  information by themselves.

Suggested scale (px): `10 · 12 · 14 · 16 · 20 · 28 · 44 · 64`.

---

## 4. Shape, line and structure

### Geometry

- **Corner radius is 0.** Instead of rounding, Endfield chamfers: a 45° clip on
  one or two corners (usually top-right or bottom-left). In CSS:
  `clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 0 100%)`.
- **Corner brackets**: L-shaped 1–2px ticks on the corners of a frame instead of
  a full border. This is the "targeting reticle" frame.
- **Hairlines**: 1px rules divide everything. Borders are often partial, such as
  a top rule only or a left accent bar, rather than full boxes.
- **Left accent bar**: a 3–4px solid bar (yellow or ink) down the left edge
  marks the active or selected row.

### Recurring decorative motifs

| Motif | Description | Where |
|---|---|---|
| Hazard stripes | 45° diagonal yellow/ink stripes, 6–10px pitch | Warning banners, loading bars, section edges |
| Dot or line grid | Faint 8px or 16px grid on backgrounds | Page background, empty states |
| Section index | `01`, `02`, `03` numbering with a slash or bar | Before section headers |
| Serial strings | `AIC-PN-0427`, `REF. 26.09.19`, fake part numbers | Corners of panels, footers |
| Crosshair / registration marks | Small `+` marks at grid intersections or panel corners | Hero areas |
| Watermark numerals | Huge, 4–8% opacity numerals behind content | Behind the current round number |
| Barcode / tick ruler | A row of thin vertical ticks | Progress, dividers |
| Diagonal cut bands | Solid yellow bands cut at an angle | Headers, CTAs |

Use no more than 2–3 motifs per screen. The look is disciplined, not busy.

### Layout

- Strict grid alignment. Everything snaps to a 4px base and 8px rhythm.
- Asymmetry: titles are left-aligned and hug the edge; metadata sits in the
  opposite corner.
- Generous negative space between blocks, dense space inside them.
- Stacked labelled fields like a spec sheet: `LABEL` (micro, muted) above
  `Value` (body or display).

---

## 5. Components (as seen in-game)

- **Primary button**: solid signal-yellow block, ink uppercase label, chamfered
  corner, sometimes a small arrow or `▶` glyph on the right. Pressed state darkens
  or inverts to ink on yellow outline.
- **Secondary button**: transparent with a 1px ink or paper border, uppercase
  label, same chamfer.
- **Tabs / nav**: uppercase labels with the active tab marked by a yellow
  underline bar or filled block; inactive tabs are muted, not hidden.
- **Cards**: flat panels with no shadow (or a very hard, offset shadow), a header
  strip with a section code, content below, and a serial string in a corner.
- **List rows**: full-width, separated by hairlines, with a left accent bar for
  selection and tabular numbers right-aligned.
- **Status chips**: small rectangular tags, mono text, like `ONLINE`,
  `PENDING` or `LV.60`, with a solid or outlined fill.
- **Notifications / toasts**: slide in from the edge as a thin strip with a
  yellow or alert leading bar, a timestamp in mono, and a one-line message.
- **Progress**: segmented bars (discrete blocks) rather than smooth fills.

---

## 6. Motion

> These patterns come from watching the game's menus, not from frame-by-frame
> measurement. The timings are starting values to tune by eye.

### 6.1 Principles

Endfield's UI moves like a machine booting a panel, not like paper sliding or a
bubble popping.

| Principle | Meaning |
|---|---|
| **Mechanical, not organic** | Motion accelerates hard and stops dead. No overshoot, bounce or spring wobble. |
| **Build, don't fade** | Elements are *constructed*: a line draws first, the frame extends from it, then content fills in. Plain opacity fades are rare. |
| **Staggered assembly** | A screen assembles in a quick cascade (frame, then header, then rows, then micro-labels) rather than appearing all at once. |
| **Linear sweeps** | Wipes and scans travel in one direction, usually left to right or top to bottom, like a scanner head. |
| **Data feels live** | Numbers count, codes scramble, and indicators blink on steps, as if a system is computing them. |
| **Quiet at rest** | Once a screen has built, almost nothing moves. Idle motion is limited to a slow blink or a thin scanning line. |

### 6.2 Timing and easing tokens

```css
:root {
  --t-instant: 80ms;   /* hover/press feedback, flicker frames */
  --t-fast:   160ms;   /* buttons, chips, tab underline */
  --t-base:   240ms;   /* panel wipe, row reveal */
  --t-slow:   420ms;   /* hero reveal, screen build */
  --t-stagger: 40ms;   /* delay between cascading items */

  --ease-out:    cubic-bezier(0.16, 1, 0.3, 1);   /* snap in, long settle, no overshoot */
  --ease-in-out: cubic-bezier(0.7, 0, 0.3, 1);    /* sweeps and bars */
  --ease-in:     cubic-bezier(0.7, 0, 0.84, 0);   /* exits: leave faster than you arrive */
}
```

- Exits are about 30% shorter than entrances.
- Use `steps(n)` for anything meant to feel digital: blinking cursors, segmented
  progress, and scramble ticks.
- Never animate longer than about 500ms in the UI chrome. Long, cinematic motion
  belongs to character and gacha screens, not menus.

### 6.3 Pattern library

#### A. Line-draw then frame (panel entrance)

A 1px rule draws across the top from left to right, the panel's body wipes down
from that rule, and then the content fades up by 4px.

```css
.panel { animation: ef-wipe var(--t-base) var(--ease-out) both; }
.panel::before {                 /* top rule */
  content: ""; position: absolute; inset: 0 0 auto 0; height: 1px;
  background: var(--accent); transform-origin: left;
  animation: ef-draw var(--t-fast) var(--ease-in-out) both;
}
@keyframes ef-draw { from { transform: scaleX(0); } }
@keyframes ef-wipe { from { clip-path: inset(0 0 100% 0); } to { clip-path: inset(0); } }
```

#### B. Staggered cascade (list and screen build)

Rows enter one after another with a small slide from the left (8–12px) and a
wipe. Cap the stagger at about 8 items so long lists don't feel slow.

```css
.history li {
  animation: ef-row var(--t-base) var(--ease-out) both;
  animation-delay: calc(min(var(--i), 8) * var(--t-stagger));
}
@keyframes ef-row {
  from { opacity: 0; transform: translateX(-10px); clip-path: inset(0 100% 0 0); }
  to   { opacity: 1; transform: none;               clip-path: inset(0); }
}
```

Set `--i` per item from JavaScript (`li.style.setProperty('--i', index)`).

#### C. Text scramble / decode

Codes and numbers cycle through random glyphs (`0-9 A-Z / - _ #`) and lock in
from left to right. Use it for new or changed values only, never for body text.

```js
function scramble(el, finalText, { duration = 420, charset = '0123456789ABCDEF#/-' } = {}) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = finalText; return; }
  const start = performance.now();
  (function frame(now) {
    const p = Math.min((now - start) / duration, 1);
    const locked = Math.floor(p * finalText.length);
    el.textContent = [...finalText].map((c, i) =>
      i < locked || c === ' ' ? c : charset[Math.random() * charset.length | 0]).join('');
    if (p < 1) requestAnimationFrame(frame);
  })(start);
}
```

Give the element `font-variant-numeric: tabular-nums` and a mono font so the
width doesn't jitter while it scrambles.

#### D. Count-up numerals

Big numbers (ratings, scores, round) count quickly from the old value to the new
one with `--ease-out`, over 300–500ms. Apply it only when the value actually
changes, not on every render.

#### E. Scan line (data refresh)

A thin horizontal band (1–2px, accent or cyan, with a soft trailing gradient)
sweeps once across a panel whose data just updated.

```css
.is-updated::after {
  content: ""; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(90deg, transparent, rgb(255 229 0 / .18) 40%, transparent 42%);
  background-size: 250% 100%;
  animation: ef-scan var(--t-slow) var(--ease-in-out) 1 both;
}
@keyframes ef-scan { from { background-position: 100% 0; } to { background-position: -50% 0; } }
```

#### F. Flicker-on

On important state changes the element blinks 2–3 times over about 120ms before
settling, like a display powering on.

```css
@keyframes ef-flicker { 0%,20%,40% { opacity: .2 } 10%,30%,100% { opacity: 1 } }
.is-live { animation: ef-flicker 160ms steps(1) both; }
```

#### G. Corner-bracket focus and selection

On focus or hover, the L-shaped corner brackets slide in from slightly outside
the element (about 4px) and tighten onto it. On selection, a yellow left bar grows
from 0 to full height.

```css
.pairing--current::after {       /* left accent bar */
  content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 4px;
  background: var(--accent); transform-origin: top;
  animation: ef-bar var(--t-base) var(--ease-out) both;
}
@keyframes ef-bar { from { transform: scaleY(0); } }
```

#### H. Button press

There's no ripple and no scale bounce. On press the button inverts (the yellow
fill swaps to an ink fill with yellow text) or nudges 1px down and right, within
`--t-instant`. A yellow sheen can wipe across the label on hover (desktop only).

#### I. Hazard-stripe march

Warning stripes scroll slowly and continuously (`background-position`, linear,
about 1.5s per cycle). This is the one idle loop allowed, and only while the
warning is active.

```css
.banner--warn::before {
  background: repeating-linear-gradient(-45deg, var(--accent) 0 8px, #141414 8px 16px);
  background-size: 22.6px 100%;
  animation: ef-march 1.5s linear infinite;
}
@keyframes ef-march { to { background-position: 22.6px 0; } }
```

#### J. Segmented progress / loading

Loading shows discrete blocks lighting in sequence (`steps()`), or a single block
bouncing between the ends of a track. There's no spinning circle. A blinking
`_` cursor or a `LOADING ···` readout goes with it.

#### K. Toast / notification strip

A leading accent bar appears first, then the strip wipes out from it horizontally,
text decodes (pattern C), and the strip holds, then collapses back into the bar
and vanishes. Enter takes `--t-base`; exit takes `--t-fast`.

#### L. Screen and tab transitions

One screen dissolves into the next a pixel at a time: a grid of square cells shrinks
away in hard `steps()`, and the incoming screen grows back out of the same grid, mono
(briefly desaturated), over about `--t-fast` out / `--t-base` in. No sliding and no
direction — a four-tab bar has no consistent "forward", and an earlier left/right wipe
left the screen sitting still behind a moving line and then jumping, which read as a
stall rather than as travel. The tab bar is the one fixed point: it never dissolves and
stays tappable throughout. The tab underline and any segmented-control ink still slide
to the new selection (`transform: translateX`) with `--ease-in-out`. Nothing crossfades.

### 6.4 Motion hierarchy (what gets which effect)

| Importance | Examples | Motion budget |
|---|---|---|
| Hero event | New pairing published, round starts | Full sequence: bar grows, then wipe, then scramble, then flicker. About 400ms. |
| Data change | Result filled in, rating updated | Scan line or count-up only. |
| Structure | Page load, panels, lists | Line-draw plus cascade, once per load. |
| Feedback | Tap, focus, toggle | Invert or bracket, under 100ms. |
| Idle | Watching state, warning | One slow loop at most (a blinking dot or hazard march). |

### 6.5 Accessibility and performance

- Under `prefers-reduced-motion: reduce`, turn off wipes, cascades, scrambles and
  loops. Keep instant state changes plus a static accent (for example the yellow bar
  already at full height).

  ```css
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation: none !important; transition: none !important; }
  }
  ```
- Animate only `transform`, `opacity` and `clip-path`. Don't animate layout
  properties.
- Flicker must stay under 3 flashes per second and cover a small area (WCAG 2.3.1).
- Screen readers get the final value at once. Scrambled text uses an `aria-label`
  or `aria-live` holding the real text, never the intermediate glyphs.
- Don't replay entrance animations on every poll refresh. Animate only the
  elements whose data actually changed (the app already diffs pairings, so reuse
  that).

### 6.6 PairingNotify motion map

| Moment | Animation |
|---|---|
| App open | Topbar rule draws, then tournament sections cascade in (B). About 400ms total. |
| **New pairing detected** | The hero card's yellow bar grows (G), the card wipes in (A), the board number and opponent decode (C), and it finishes with one flicker (F). This is the signature moment of the app. |
| Refresh tapped | The icon button inverts (H) and a segmented readout `SYNC ···` steps. Changed cards get a scan line (E); unchanged cards stay still. |
| Result arrives in history | Only that row gets a scan line, and the score decodes. |
| Degraded banner | Wipes down from the top with the hazard stripe marching (I). |
| Switching screen or tab | Pixel dissolve (L): the outgoing screen shrinks to nothing in a grid, the incoming one grows back out of it. The tab bar itself never moves. |
| A live event ● dot | A small blinking dot next to LIVE/WATCHING chips (1s `steps(2)` blink). This is the only persistent idle motion besides an active hazard march. |
| Enable notifications succeeds | The button fill wipes to a `CONFIRMED` state with a flicker, then settles. |

---

## 7. Voice and copy

- Labels read like system output: `PAIRING CONFIRMED`, `ROUND 05`,
  `STATUS: STANDBY`, `SYNC 14:02`.
- Pair a terse English header with a plain-language line underneath for clarity.
  The header is the look; the sentence explains what it means.
- Avoid exclamation marks and emoji in the chrome.

---

## 8. Applying it to PairingNotify

The current UI (`web/styles.css`) is a soft dark theme: rounded 10–14px corners,
blue accent `#6ea8fe`, and system sans. Here is how to move it toward the
Endfield language while keeping it phone-first and readable at a glance.

### Mode

Keep **dark (graphite) as default**, since the app is opened at a tournament
hall, often in dim light, and it fits the HUD side of Endfield. Offer a light
"paper" theme through `prefers-color-scheme: light` using the same tokens.

### Token swap

```css
:root {
  --bg:        #1B1C1E;   /* graphite */
  --surface:   #26282B;
  --surface-2: #2F3236;
  --line:      rgba(154,156,158,.35);
  --text:      #ECECEA;
  --muted:     #8E9196;
  --accent:    #FFE500;   /* signal yellow replaces blue */
  --info:      #34D6E0;
  --alert:     #FF5A36;
  --white-piece: #ECECEA;
  --black-piece: #141414;
  --radius: 0;
  --chamfer: 10px;
  --font-display: "Novecento Sans", "Rajdhani", "Barlow Condensed", sans-serif;
  --font-body: "HarmonyOS Sans", "Inter", system-ui, sans-serif;
  --font-mono: "Iosevka", "JetBrains Mono", ui-monospace, monospace;
}
```

### Component mapping

| PairingNotify element | Endfield treatment |
|---|---|
| `.topbar` "Pairings" | Uppercase display font, wide tracking. Mono micro-caption under it, like `AIC // PAIRING MONITOR`. Refresh button becomes a square outline icon button. |
| `.status` line | Mono, muted, formatted as a readout: `SYNC 14:02 · 3 EVENTS`. |
| `.tournament h2` | Section index plus uppercase title: `01 ─ BANGKOK OPEN 2026`. |
| `.pairing--current` (hero) | Chamfered panel with a 4px yellow left bar. Board number as a huge display numeral with a faint watermark round number behind it. Opponent name in body font at 22–24px. Rating in mono. Colour chip as a small square (not a circle) labelled `WHITE` or `BLACK`. |
| `.pairing__meta` | Mono micro-labels: `RD 05 │ BD 12 │ 15:00`. |
| `.history li` | Flat rows split by hairlines instead of rounded pills. Mono round number, result right-aligned in tabular mono, colour shown as a 2px left tick. |
| `.banner--warn` (degraded) | Hazard-stripe top edge, graphite body, alert-orange label `SYSTEM DEGRADED`, then the plain-language explanation. |
| `.button` | Yellow block, ink uppercase label, chamfered corner. `--secondary` becomes a 1px outline. |
| `.panel` (Notifications, Fast watching) | Header strip with section code (`02 / NOTIFY`, `03 / WATCH`), status shown as a chip (`ACTIVE`, `STANDBY`). |
| `textarea` | Mono, square, 1px rule, corner-bracket focus state in yellow. |
| `.foot` generated time | Serial-string style: `BUILD 2026.09.19-1402`. |
| Push notification copy | `RD 5 · BD 12 · vs. Surname (2150) · WHITE`. Short and scannable on a lock screen. |

### Guardrails

1. **Legibility first.** The opponent name, board and colour must read in
   under a second. Decoration never overlaps or competes with them.
2. Contrast: body text at least 4.5:1, yellow only as fill or on graphite.
3. Minimum tap target is 44px, even with the sharp compact look.
4. Decorative micro-text uses `aria-hidden="true"`.
5. **No game assets, logos, character art or the Endfield wordmark.** Borrow the
   design language only.
6. Self-host or `font-display: swap` any web fonts so the app still works offline
   as a PWA. Novecento and HarmonyOS have their own licences; use the free
   fallbacks if in doubt.

---

## References

- [Arknights: Endfield on Wikipedia](https://en.wikipedia.org/wiki/Arknights:_Endfield)
- [GameFontLibrary: Arknights: Endfield fonts](https://www.gamefontlibrary.com/games/arknights:-endfield)
- [Game UI Database: Arknights](https://www.gameuidatabase.com/gameData.php?id=478)
- [Character menu animations in Endfield (YouTube)](https://www.youtube.com/watch?v=U_uRTrbBU5A)
- [Endfield UI walkthrough (UltimateGacha)](https://ultimategacha.com/arknights-endfield-ui-walkthrough-every-menu-subsystem-explained-new-players/)
- [Example community Endfield-style web UI (TNTKien/codex-resets#6)](https://github.com/TNTKien/codex-resets/pull/6)
