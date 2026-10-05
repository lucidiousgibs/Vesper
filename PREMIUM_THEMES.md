# Premium Deck Themes

Three premium themes - **Bulkhead**, **Cold Ballast**, and **Command Deck** -
built as a genuinely different design system on top of VESPER, not a color
palette layered over the existing UI. Switching from a standard theme to one
of these changes shape, typography, component construction, and behavior,
not just hue.

The six standard themes (Dark, Light, Analog Signal, Night Static, Dusk
Horizon, YC Retro, Phosphor Deck) are **unchanged** - functionally and
visually identical to before this work. Every rule described below is gated
behind `:root[data-theme="bulkhead"|"cold-ballast"|"command-deck"]` and does
nothing at all otherwise; verified directly against the running app (see
"How this was verified" below), not just by inspection.

## Architecture

```
src/themes/premium/
  premium-tokens.css      full ~50-var token sheet x3, + construction tokens
  premium-structure.css   shared component language every deck reads through
  bulkhead.css            Bulkhead-only geometry
  cold-ballast.css        Cold Ballast-only geometry
  command-deck.css        Command Deck-only geometry

src/components/premium/
  StatusLamp.tsx          physical indicator lamp (housing/unlit/lit/bloom)
  TechnicalLabel.tsx      small etched-plate reference marking
```

All five CSS files import from `App.tsx`, after `App.css`. Each is a plain
stylesheet, not a JS module - the split exists purely so the six standard
themes and the premium system can never collide while editing one or the
other, and so a future fourth deck is one more `.css` file plus one line in
each shared selector list, not a rewrite.

**`useTheme.ts` was refactored** to broadcast theme changes over a
`window` `CustomEvent` instead of relying on `usePersistentState`'s plain
`useState`. This mattered for real: the previous implementation meant two
separate components calling `useTheme()` had two unsynced copies of the
theme value - the persistent `TopBar` (never unmounted between tab
switches) would keep rendering whatever it read at its own mount time until
a full reload, even after `SettingsPage` changed the theme. Every
`useTheme()` call site now stays live-synced the instant *any* of them
calls `setTheme`, with the exact same external API (`[theme, setTheme] as
const`) so no call site needed to change. A new `isPremiumTheme(theme)`
helper is exported alongside it.

## What actually changes

| Layer | What changes | Where |
|---|---|---|
| **Color** | Full token sheet per deck - surfaces, text, accent/status, kill-mail colors, ISK, standings, the 10-step security gradient, each running its own "safe → danger" hue family | `premium-tokens.css` |
| **Shape** | `--radius-sm`/`--radius-md` zeroed (→ ~225 existing consumers go hard-edged for free); chamfered `clip-path` notch + corner brackets on `.dashboard-header`/`.market-stat-card`; per-deck geometry (Bulkhead hazard band + rivets + chamfered nav; Cold Ballast containment-ring chips + vertical accent rail; Command Deck segmented double-line framing) | `premium-structure.css` + per-deck files |
| **Type** | `--font-label` repointed per deck (Oswald / Saira Condensed / Saira Condensed); `--font-display` per deck (Oswald / Orbitron / Exo 2); every label-style element forced uppercase + tracked; numeric readouts forced to the new global `--font-mono` (Share Tech Mono) with `tabular-nums` and a phosphor glow. Prose (`--font-body`) is never touched | `premium-structure.css` |
| **Weight** | Full button physics - resting housing shadow, hard press-and-lock (`translateY` + shadow collapse, zero easing), a distinct "latched" look for persistent toggle states (tabs, radius filters, label chips), disabled buttons rendered as visibly unpowered (`grayscale`+`brightness` filter, no depth) rather than just faded | `premium-structure.css` |
| **Indicators** | `StatusLamp` - real layered housing (bevel ring → unlit/lit core → bloom), circular and rectangular variants, wired into the shared `StatusChip` component so every existing usage app-wide (server status, character connection, etc.) picks it up automatically | `StatusLamp.tsx`, `StatusChip.tsx` |
| **Navigation** | Sidebar reads as a breaker rack - thicker frame, a real indicator lamp per nav item (CSS-only, no JSX change) that energizes on the active route instead of just recoloring text; drag-to-reorder's own transform is left completely alone | `premium-structure.css` |
| **Everything else in the "first pass scope"** | Tabs (switch-bank rail), tables (structural dividers + accent rail header), forms/inputs (recessed "dial" housing), tooltips (`.help-badge-popover` → inset diagnostic screen), the global error modal (→ alert annunciator panel), toasts (→ annunciator strip), loading skeletons (→ stepped scanning tick instead of a smooth shimmer), scrollbars (thin/high-contrast) | `premium-structure.css` |
| **Atmosphere** | One full-viewport signature layer per deck, `z-index: 500` (above normal content, below the toast/banner/kill-alert overlays at 9997-9999): Bulkhead a worn porthole vignette, Cold Ballast a CRT scanline raster, Command Deck a diagonal glass sheen | per-deck files |
| **Motion** | A ~340ms ignition flicker + one-line boot label (`BUS CHECK // LINK OK`, `SYS.LINK — SYNC`, `NAV.LOCK — READY`) plays on every page mount, via the one universal `<main className="main ...">` wrapper all 25 page components already share - zero JSX changes needed anywhere | `premium-structure.css` + per-deck `content` |
| **Degradation** | A real (not decorative) RGB-split/power-sag flicker, `.premium-signal-degraded` on `document.body` for 650ms, triggered from exactly one place: `useErrorReporter`'s `reportError` - the single choke point every error path in the app already goes through. Never fires ambiently | `useErrorReporter.tsx` + `premium-structure.css` |
| **Accessibility** | Every animation this system introduces (boot flicker, lamp blink, scan-tick loading, degrade flicker) has a static fallback under both the OS `prefers-reduced-motion: reduce` media query and the app's in-app Motion setting set to Off (`body[data-reduce-motion="true"]`, kept in step by `useEffects`) - verified live, not just written | `premium-structure.css` |
| **Sound** | Architecture only, deliberately not wired to real audio yet - see "Sound" below | `lib/sound.ts`, `usePremiumSoundEnabled.ts` |

### The three decks

| Deck | Mood | Display / label font | Accent | Signature geometry |
|---|---|---|---|---|
| **Bulkhead** | Gritty industrial freighter - rust, hazard amber, a reactor overdue for a teardown | Oswald / Oswald | `#d98c2b` | Hazard-stripe header band, corner rivets, chamfered nav items, thick 4px sidebar frame |
| **Cold Ballast** | Submarine ops / bio-lab - pressure hulls, tank glass, chilled clinical light | Orbitron / Saira Condensed | `#35c9c9` | Containment-tube double-ring chips, vertical accent rail on the page header, CRT scanline raster |
| **Command Deck** | Bridge glass / warm switch banks - HUD blue readouts paired against amber physical switches | Exo 2 / Saira Condensed | `#4f7dff` | Segmented double-line chip framing, tactical-glass header glow, diagonal sheen |

## Sound

`src/lib/sound.ts`'s existing pattern (a bundled MP3 asset, imported
directly so Vite resolves it at build time, played through a lazy-singleton
`<Audio>` element) is what `playProximityAlert`/`playNotificationPing`
already use - there's no Rust-side audio engine anywhere in this app, and
none was added. `playPremiumRelayClick`/`playPremiumMechanicalThrow` exist
as no-ops in the same file, plus a real `usePremiumSoundEnabled` settings
hook (`vesper.premium.soundEnabled`, defaults on) - deliberately not wired
to actual samples, since a static `import ... from "nonexistent.mp3"` would
fail the build rather than degrade gracefully, and inventing a low-quality
placeholder clip isn't better than no sound. When real "mechanical relay
click" / "heavy breaker throw" samples exist, bundling them the same way
the existing two sounds are bundled turns these into real functions with no
other call-site changes needed.

## Bugs caught and fixed during the build

- **Corner brackets vs. the clip-path notch.** The corner-bracket
  pseudo-elements were first positioned on the same two corners the
  chamfer notch cuts away - `clip-path` clips an element's own
  `::before`/`::after` along with everything else, so the brackets
  would've been invisible. Moved to the opposite diagonal.
- **Clip-path clipping real dropdowns.** `.industry-inputs-panel` and
  `.settings-section` sometimes host an autocomplete suggestion dropdown
  (`.gatecheck-slot-results`, `position: absolute; top: 100%`) that
  renders below the panel. `clip-path` clips a box's overflow regardless
  of its `overflow` property, so notching those two would have silently
  cut real, functional dropdowns off. Both keep the inset-bevel shadow
  (purely decorative) but not the notch; only `.dashboard-header` and
  `.market-stat-card` get the full chamfer.
- **`TechnicalLabel` changing standard-theme output.** First draft always
  rendered its text; dropped into the shared sidebar footer (rendered by
  every theme), that would have added new visible text with no styling to
  make sense of it under the six standard themes. Now renders `null`
  unless `isPremiumTheme(theme)`.
- **Unsynced `useTheme()` instances.** Caught while designing `StatusLamp`
  - see the `useTheme.ts` refactor above.
- An earlier draft accidentally left a literal `$PREMIUM_SELECTOR$`
  placeholder in several selectors (a comma-separated list can't share a
  compound-selector prefix - `:root[a], :root[b] .foo` matches `:root[a]`
  alone OR `.foo` under `:root[b]`, not `.foo` under either) - caught via
  a brace/selector sanity pass before it shipped.

## How this was verified

`npx tsc --noEmit` is clean, and both a programmatic brace-balance check
and a manual read pass ran on every new CSS file. Beyond that, the running
dev app was actually opened in a browser pointed at the Vite dev server
(`http://127.0.0.1:1520`) and inspected live:

- Switched `data-theme` between all three decks and read back
  `getComputedStyle` on real rendered elements (the login screen, the
  global error modal, its heading and button, `body::after`) - confirmed
  exact background colors, `border-radius: 0px`, the right `font-family`
  per deck, the right `box-shadow` housing values, and each deck's own
  distinct atmosphere `background-image` (radial vignette / scanline
  raster / diagonal sheen - three different values, not one shared rule).
- Switched back to the standard `"dark"` theme and confirmed the same
  elements revert exactly - `border-radius: 8px` on the modal,
  `background-image: none` on `body::after` - proving no premium rule
  leaks into a standard theme.
- Set `body[data-reduce-motion="true"]` and confirmed a `.skeleton-row`'s
  computed `animation-name` resolves to `none`, not just written that way.

ESI-authenticated screens (dashboard, sidebar with a live session, etc.)
couldn't be exercised this way - the plain browser has no Tauri IPC bridge,
so any page that calls `invoke()` throws immediately (this is also what's
firing the repeated "Live kill stream error" during this testing - happens
on the standard themes too, it's a pre-existing artifact of loading the
app outside Tauri, not something introduced here). The native app window
was left running throughout and confirmed alive afterward.

## Round two: page layouts, not just component skins

The first pass covered shared components everywhere (buttons, tabs,
tables, forms, tooltips, modals, toasts, loading states) - real, but it
meant every page still had the *same arrangement* of content, just
reskinned. This pass changed two actual pages' composition, not their
components:

- **Map** (`MapView.tsx` + `.map-canvas-wrap` in `premium-structure.css`):
  the canvas itself now resolves `--accent`/`--danger`/`--gate` at draw
  time via a new `hexToRgbTriple()` helper, replacing four places that
  were hardcoded to the *original dark theme's* exact hex values
  (`rgba(111, 195, 217, ...)` cyan for the constellation hulls and the
  ticker-hover ring, `rgba(255, 90, 60, ...)` for the active-kill pulse,
  `rgba(240, 192, 74, ...)`/`"#f0c04a"` for the current-location marker)
  regardless of which theme was active - **a real bug fixed for all nine
  themes**, not just the three premium ones; a cyan ring on an
  amber-and-rust Bulkhead map, or the home marker's roof/body panel
  always rendering in the default theme's exact `#1a1c21`/`#131418`, was
  wrong before this on every non-default theme. On top of that, premium
  themes get a decorative instrument layer over the canvas - an inset
  bezel ring, a slow 14s long-range-scanner sweep (`mix-blend-mode:
  screen`, reduced-motion-aware), and the search bar/layer toggles/kill
  ticker rail restyled as console chrome instead of website widgets. None
  of this touches the canvas draw loop's actual logic, only its color
  inputs and a DOM layer sitting on top of it.
- **Dashboard** (`Dashboard.tsx` + `.dashboard-home` in
  `premium-structure.css`): real layout re-composition via CSS Grid, not
  a re-skin of the same stack. `.dashboard`/`.dashboard-header` turned out
  to be shared by three *other* pages (Industry, Mining, Multiboxing)
  reusing those same generic classes for their own different content, so
  the home page got one new class, `dashboard-home`, to target precisely.
  Its two ticker widgets (`NewsTicker` and `LiveActivityTicker` - which
  already happen to share the exact class `news-ticker`) go from
  full-width-stacked to an asymmetric 2:1 side-by-side split via
  `grid-template-areas`, using the adjacent-sibling combinator
  (`.news-ticker + .news-ticker`) to tell the two apart by position
  rather than a class neither one uniquely has. Collapses back to the
  standard stacked order under 900px. Verified directly: injected a
  synthetic `.dashboard-home` tree into the running page and confirmed
  both the wide-viewport 913px/457px column split and the narrow-viewport
  stacked fallback resolve exactly as written.

## Round three: a real component library + a rebuilt Dashboard

The `VESPER_PREMIUM_BRIDGE_ENVIRONMENTS_MASTER_PROMPT.md` directive asked
for something categorically bigger than a styling pass - a real hardware
component library and a Dashboard whose actual composition, not just its
skin, is different under a premium deck. Built per that document's own
phase order (A: shell primitives, B: hardware library, C: rebuild the
Dashboard; D/E/F - visual review, a second radical page, full propagation
- are the explicit next steps, not done here):

- **`src/components/premium/`** gained four new primitives: `Annunciator`
  (a rectangular backlit indicator built on `StatusLamp`'s housing, states
  `on`/`off`/`warn`/`danger`), `MechanicalButton` (a heavier, distinct
  control from the generic button treatment every `<button>` already gets
  - thicker housing, zero-easing press, reserved for a page's actual
  primary actions), `TelemetryRail` (a strip of small labelled readouts),
  and `ScreenHousing` (the bezel-over-recessed-display construction layer
  - a title strip on the console plane, content on the display plane).
- **`PremiumDashboard.tsx`** - a genuinely different composition, not a
  reskinned character grid: a command-status header, three zones side by
  side (SYS STATE / CAPSULEER STATUS - the real character cards, reused
  as-is / ALERT BANK), a telemetry rail of aggregate real numbers, then
  the existing tickers reframed as two auxiliary monitors. Every lamp and
  number in it is derived from data `Dashboard.tsx` already fetches -
  connected-character count, summed ISK/SP across `CharacterOverview`,
  how many are training, how many need reauth, whether sign-in is
  pending - nothing invented. `Dashboard.tsx` itself changed only at its
  `return`: same hooks, same effects, same fetching, branching to
  `<PremiumDashboard>` only when `isPremiumTheme(theme)`, per the
  directive's own "share logic, separate presentation" pattern.
- **New stylesheet: `premium-instruments.css`** - deliberately *not*
  scoped behind `:root[data-theme="x"]` the way `premium-structure.css`
  is. Its classes (`.annunciator`, `.mechanical-button`, `.screen-housing`,
  `.telemetry-rail`, `.premium-dashboard*`) are brand new and only ever
  rendered by components that already sit behind an `isPremiumTheme`
  check, so there's nothing under a standard theme for these selectors to
  ever match - the safety property the scoping exists for elsewhere is
  already guaranteed here by which components exist. Colors still resolve
  correctly per deck through ordinary `var(--accent)`/`var(--deck-*)`
  inheritance.

### Two real specificity bugs caught by testing, not just written

Both were confirmed live - injected the actual markup into the running
dev server and read back `getComputedStyle`, not just reasoned about it:

- **`.mechanical-button` silently lost to the generic button rule.**
  `premium-structure.css`'s generic press-and-lock is scoped
  `:root[data-theme="x"] button:not(.nav-item):not(:disabled)`, which
  carries more specificity (the `:root[data-theme="x"]` prefix alone adds
  two points) than an unscoped `button.mechanical-button:not(:disabled)`
  - so `.mechanical-button`'s own box-shadow/transform/transition were
  being silently overridden despite loading later in the cascade.
  Confirmed live: `box-shadow` computed to the generic rule's `0 3px 0`,
  not `.mechanical-button`'s own `0 5px 0`. Fixed by excluding
  `.mechanical-button` from the generic rule everywhere it appears
  (`button:not(.nav-item):not(.mechanical-button)`), the same pattern
  already used for `.nav-item` - explicit mutual exclusion instead of a
  specificity fight.
- **`.mechanical-button-primary`'s border color lost to its own base
  rule.** A single-class selector (`.mechanical-button-primary`) has
  lower specificity than the element+class base rule
  (`button.mechanical-button`) that sets the same `border` shorthand -
  confirmed live (`border-color` computed to the neutral base color, not
  the accent). Fixed by matching specificity:
  `button.mechanical-button.mechanical-button-primary`.

## Extending later

Add a deck by:

1. adding its id to `ThemeId` and an entry to `THEMES` in `useTheme.ts`
   (`tier: "premium"`; give it `family: "glass"` or `"terminal"` if it should
   share one of the family files below, and `segmentClock: true` if it should
   show the EVE clock as a seven-segment readout);
2. adding its palette to `scripts/gen-deck-tokens.mjs` and running
   `npm run gen:decks`, which rewrites `premium-tokens-extra.css` (the older
   hand-written decks keep their blocks in `premium-tokens.css`);
3. adding its starting effect levels to `THEME_FX` in `useEffects.ts`;
4. adding its variables, boot label and one or two signature touches to
   `premium-decks-extra.css` (or, for a deck with a lot of its own geometry, a
   file of its own like `bulkhead.css`, imported in `App.tsx`).

`premium-structure.css` needs no edits: it keys off `data-tier="premium"`, and
the family files key off `data-family`, which `useTheme` stamps from `THEMES`.


## Effects settings

`src/hooks/useEffects.ts` replaces the old single Reduce Motion checkbox with
ten settings under Settings > Display > Effects: **Motion** (Off / Low / Full),
**Map animation** (Low / Normal / High), **Glow**, **CRT**, **Scanlines**,
**Grain**, **Flicker**, **Imperfection** (Off / Authentic / Extreme), **Faction accent**
(the deck's own, or Amarr, Caldari, Gallente or Minmatar colours) and **Sound cues**. The effective value
of each is stamped on `<html>` as `data-fx-*`, and
`src/themes/premium/premium-fx.css` turns those into intensity variables
(`--fx-glow-k`, `--fx-crt-k`, `--fx-scan-k`, `--fx-grain-k`, where 1 is exactly
the look each deck had before the system existed) and animation gates.

- **Motion Off** is the old Reduce Motion behaviour; `body[data-reduce-motion]`
  is still maintained so every existing rule keeps working.
- **Motion Low** keeps warnings (lamp blink, signal degrade), loading (scan-tick)
  and selection feedback (lock-on) and stops the ambient and decorative loops.
- **Flicker** and the map scan bar only play at Motion Full.
- Defaults come from `THEME_FX` in `useEffects.ts` layered over `BASE_FX`
  (today's look). A setting is stored only when it differs from the active
  theme's default.
- Premium effects still deliberately ignore the OS reduced-motion preference;
  Settings shows a one-line notice instead.

## Phosphor Green (fifth deck)

The first deck led by green. Black glass, aged phosphor-green readouts, amber
reserved for ISK and caution so the two never compete, and the squarest geometry
of the five decks (6px notch).

| | |
|---|---|
| Accent | `#5ee68c`, ISK and warning in amber `#e6b53c` |
| Type | Oxanium display, Share Tech Mono labels |
| Signature | Shell-prompt page titles with a block cursor (steady below Motion Full), dashed terminal frames on the topbar badges, a lit phosphor strip on the active nav row, a thin scan raster plus a green vignette, inverse-colour text selection |
| Defaults | Same as the other decks, plus light Grain (`THEME_FX` in `useEffects.ts`) |
| Files | `premium-tokens.css` (token block), `phosphor-green.css` (geometry), registered in `useTheme.ts` and imported in `App.tsx` |

Its security gradient is generated by spacing hue evenly between three anchors
(1.0 cyan, 0.4 amber, 0.1 red) instead of hand-picking each step.

With this deck the premium tier has an accent lead for each of cyan (Cold
Ballast), amber (Bulkhead, Amber Exchange) and green (Phosphor Green).

## Holographic (sixth deck)

The one deck with no hardware. Where the others build keycaps, bevelled plates
and recessed dials, Holographic flattens all of it into thin emissive edges on
black glass. It is cyan-led like Cold Ballast but reads completely differently
because nothing has physical depth.

| | |
|---|---|
| Accent | `#3de1ff`, a violet secondary, security scale from blue `#4cacf0` to coral `#ff667a` |
| Signature | Flat glass buttons that light on hover, wells with no inner shadow (a lit edge on focus), transparent topbar chips with a hairline, one cyan hairline under every page header, a faint cyan glow falling from the top of the screen instead of a raster or vignette |
| Defaults | Glow Strong, Scanlines Off, Flicker Off (`THEME_FX` in `useEffects.ts`); everything else as the other decks |
| Files | `premium-tokens.css` (token block), `holographic.css` (geometry), registered in `useTheme.ts` and imported in `App.tsx` |

Its geometry file only overrides the physical rules from `premium-structure.css`
(buttons, fields, housings, headers); every layout and every signal system is
shared with the other decks. The glow follows the Glow and CRT settings, so
turning both Off leaves clean flat glass.

The security gradient is the same evenly-spaced-hue construction as Phosphor
Green, with the red anchor set to coral (hue -8) so the interpolation passes
through orange and never swings through purple.

## Further decks (eleven more, from the research report)

Every deck now starts from a palette in the research report whose text, muted
text, accents and status colours were contrast-checked against their surfaces.
Their token blocks are generated (`scripts/gen-deck-tokens.mjs`, `npm run
gen:decks`) rather than typed by hand, and each deck's security scale uses the
same evenly-spaced-hue construction as Phosphor Green and Holographic. Three
shared files carry the geometry; `premium-decks-extra.css` holds each deck's own
variables, boot label and signature.

| Deck | Family | Leads with | Signature | Starts at (Motion / Glow / CRT / Grain / Scan / Flicker / Sound) |
|---|---|---|---|---|
| Capsuleer Tactical | hardware | olive and gold | Faint range rings on the map, a `TGT` tag on every page title, flat matte plates | Low / Subtle / Off / Low / Off / Off / Minimal |
| Amber Command | terminal | amber | Double-line frames, shell prompt, seven-segment EVE clock | Full / Subtle / Subtle / Low / Low / Subtle / Full |
| Cybernetic | glass | gold and cyan | Gold-to-cyan scan edge under the topbar, `//` title glyph, 1.5px outlines | Full / Subtle / Off / Off / Low / Off / Minimal |
| Mecha Command Alert | hardware | alarm orange | Hazard-stripe band under every page title, heavy frames, hard cuts between pages | Full / Subtle / Off / Off / Off / Off / Full |
| Deep Space | glass | cool blue | A sparse star field, hairline edges at low contrast | Low / Subtle / Off / Low / Off / Off / Minimal |
| Cyberpunk Neon | glass | cyan, violet, magenta edges | A 160ms glitch on every page change, magenta edge glow on the sidebar, lit titles | Full / Strong / Subtle / Low / Low / Subtle / Full |
| Corporate Future | glass | pale cyan on navy | Rounded cards and soft shadows, no glow | Low / Subtle / Off / Off / Off / Off / Off |
| Alien Biotech | glass | pale organic green | Irregular rounded corners and a slowly breathing mist (stops below Motion Full) | Full / Subtle / Off / Low / Off / Off / Minimal |
| 90s Mecha | hardware | pale green with orange status | Double-line schematic frames, square tags on titles, dashed orange topbar edge | Low / Subtle / Subtle / Low / Low / Off / Minimal |
| White Phosphor | terminal | off-white | Thin single lines, no fills, monospace throughout | Low / Subtle / Subtle / Low / Low / Off / Off |
| Cassette Deck | hardware | green and amber over olive | Embossed label strips on page titles, seven-segment EVE clock, heavy grain | Full / Subtle / Subtle / High / Low / Subtle / Full |

Families: **glass** (`premium-glass.css`) flattens the shared hardware into thin
lit edges and takes its look from variables (`--glass-edge`, `--glass-radius`,
`--glass-shadow` and so on); **terminal** (`premium-terminal.css`) is the
Phosphor Green recipe (prompt and cursor on titles, terminal frames, lit nav
strip, raster) with `--term-prompt`, `--term-badge-style` and `--term-raster-rgb`;
**hardware** decks ride the shared premium structure directly.

The two decks set in a wide face, White Phosphor (monospace) and Cyberpunk Neon
(Orbitron), ease the pilot name and ISK lines on the dashboard cards down a size
so they stay on one line.

Fonts: IBM Plex Mono, VT323 and B612 Mono were added as bundled `@fontsource`
packages for these decks (the other faces were already in the app).

## Signal systems (premium decks only)

Everything below renders only under a premium deck (`isPremiumTheme`, or CSS
scoped to `:root[data-tier="premium"]`), so the standard themes are untouched.
Rule for all of it: every number, state and line of text comes from real app
data. Nothing is invented for atmosphere.

| System | What it does | Where |
|---|---|---|
| **Signal lamp** | A status lamp that fades as its data ages (full brightness for a few seconds, steady dimming, amber when stale). Brightness comes from the age on a shared one-second clock, not an animation loop. Used on the topbar kill-feed indicator. | `premium/SignalLamp.tsx`, `hooks/useNow.ts` |
| **Event log + SYS lamp** | A capped in-memory log of real events: every error the error reporter shows, tracked-player alerts, route pushes, character switches, startup checks. The topbar SYS lamp reads it: Nominal with no errors in ten minutes, Degraded for one or two, Faulted for three or more. | `lib/eventLog.ts`, `TopBar.tsx` |
| **Kill tiers** | Feed rows get `kills-tier-1/2/3` from the kill's own data: tier 1 a loss or a billion-ISK kill (lit rail), tier 3 NPC, pod or under a million ISK (dimmed, full on hover). | `KillFeedTable.tsx`, `premium-signal.css` |
| **Toast tiers + flood control** | A tracked loss is a critical toast. Three or more toasts in ten seconds collapse into one count toast; every event is still in the bell. Notification pings are limited to one per three seconds, and the proximity flash can never restart faster than 600 ms (applies to every theme, as a photosensitivity guard). | `useToast.tsx`, `useNotificationCenter.tsx`, `ProximityFlashOverlay.tsx` |
| **Map budget** | The pulse overlay draws the freshest 30 pulsing systems with the full blur glow and sonar burst, up to 150 as plain pulsing dots, and leaves the rest static. Motion Low keeps the one-shot sonar burst but not the continuous breathing; Motion Off behaves like reduced motion. HUD ruler ticks line the top and left edges. | `MapView.tsx`, `premium-signal.css` |
| **Threat bars** | Likely Gate Camps and Gate Check show kills as a 12-cell segmented bar whose zones match the existing `killBand` thresholds, with a shape and a word beside it (circle Low, triangle Medium, square High) so colour is never the only cue. Likely Gate Camps also gets a recency lamp. Counts are activity in the last hour, not a probability. | `premium/SegmentBar.tsx`, `LikelyGateCamps.tsx`, `GateCheck.tsx` |
| **Timer bars** | A 10-cell progress bar plus a percentage for a timer with a real start and a real end: active industry jobs (character Industry Jobs tab, from the job's start and end dates) and running PI extractors (colony pin card, from the pin's install and expiry times). It shows nothing when the timestamps do not describe a span, for finished jobs, and under the standard themes. The PI bar assumes ESI's install time is the start of the current extraction program; it has only been checked against fixture data. | `premium/TimerBar.tsx`, `CharacterDetail.tsx`, `PlanetaryColonies.tsx` |
| **Contact trails** | Every real kill leaves a ring and square on its system that fade over ten minutes, aged from when the kill actually happened (so a kill that was already minutes old when seen starts part-faded). Static and cheap, so they sit outside the animation budget and keep drawing at every Motion level. Map Filters menu, on by default. | `MapView.tsx` |
| **Route particles** | A few lights with fading tails run origin to destination along the active route at a fixed screen speed. Lowest priority: they take only what the draw budget has left after the kill pulses, run only at Motion Full, and stop while the window is hidden. Map Filters menu, on by default. | `MapView.tsx` |
| **Map animation budget** | The Map animation setting scales how many pulses get the full glow and burst, how many animate at all, and how many route particles run (Low 12 / 60 / 6, Normal 30 / 150 / 12, High 60 / 300 / 24). Normal is exactly the budget the map had before the setting existed. Applies under every theme. | `MapView.tsx`, `useEffects.ts` |
| **Seven-segment display** | A dependency-free SVG readout (lit segments in the accent with Glow, unlit ones faintly ghosted). Used for the EVE clock on Amber Command and Cassette Deck, switched on per deck with `segmentClock` in `THEMES`. | `premium/SegmentDisplay.tsx`, `TopBar.tsx` |
| **Activity sparklines** | A six-slice trend (ten minutes each, oldest first) beside each gate's activity bar on Likely Gate Camps, counted in the backend from every kill's own timestamp, and on Gate Check, counted from the events it already fetched. Real kill counts only; an empty hour draws a flat baseline. | `premium/Sparkline.tsx`, `kill_history.rs`, `LikelyGateCamps.tsx`, `GateCheck.tsx` |
| **Kill-rate trace** | A twelve-slice trace (five minutes each) of kills across all of New Eden, inside the topbar kill-feed chip, refreshed once a minute from the local kill store. Hidden below 1750px. A warning triangle also appears when the kill stream has not answered recently, so staleness is never colour alone. | `TopBar.tsx`, `get_kill_rate_bins` in `kill_history.rs` |
| **Tracked-gate camp watch** | Watches the gates you track and, the moment one newly crosses into high activity (6 kills in the last hour, the same line as the red band), writes a log line, shows a toast and plays the camp cue. The first look only records where every gate stands, so opening the app next to an already-camped gate is silent, and a gate that stays hot does not repeat. | `hooks/useTrackedGateCampWatch.tsx` |
| **Alert strip** | A tier-1 event (a tracked loss, or a flood summary) slides in under the topbar, holds about six seconds and slides out, instead of a corner toast. Only the newest shows; others inside the same window fold into "+N more". Everything else stays a corner toast. | `ToastStack.tsx`, `premium-signal.css` |
| **Refresh scan pulse** | A single line crosses the Gate Check and Likely Gate Camps tables once when their data refreshes. Quiet on first load; gone at Motion Off. | `premium/ScanPulse.tsx` |
| **Row decay** | Kill-feed rows lose brightness as the kill ages: full for ten minutes, easing to 60% by two hours. Tier-1 rows never dim and every row returns to full on hover. Driven by a 30-second clock that only runs under a premium deck. | `KillFeedTable.tsx`, `hooks/useNow.ts` |
| **Check connections** | A Ctrl+K command that re-runs the startup checks (live ESI request with its real round-trip time, character, map index, kill stream), writes each result to the system log and opens it. Shares `lib/diagnostics.ts` with the startup sequence. The server badge also shows the last ESI round trip in ms, from the same poll it already made. | `CommandPalette.tsx`, `lib/diagnostics.ts`, `TopBar.tsx` |
| **Bridge arcs** | Jump bridges draw as shallow upward arcs instead of straight dashes, so a bridge reads as a jump over the gate lines. | `MapView.tsx` |
| **Sound: kill and camp cues** | Two more of the report's cues: a low thud for a tracked kill and a falling three-note figure for a camp. Both play at Minimal. Every cue now has a 1.2 second minimum gap so a burst of events is one sound. | `lib/cues.ts` |
| **Faction accent and imperfection** | Faction accent recolours the deck's accent family (the map re-reads it live). Imperfection adds a faint red and cyan fringe to page titles (Authentic) or a stronger one plus a slight shake on the map frame (Extreme, Motion Full only). Frames and titles only, never data. | `premium-fx.css`, `useEffects.ts` |
| **Wormhole edge fade** | A wormhole edge dims as its known lifetime runs down, and goes faint and dotted once past it. Holes with no known lifetime stay full strength. | `ConnectionEdgeLine.tsx` |
| **Command line** | Ctrl+K opens a terminal-style palette: pages, every page's tabs, switching character, system lookup by name, and the system log. Up/Down, Enter, Esc. | `premium/CommandPalette.tsx` |
| **System log** | Opens from the SYS lamp or the command line. Real events with UTC times, newest first, Copy and Clear. | `premium/SystemLogPanel.tsx` |
| **Startup sequence** | Once per launch, at Motion Full, about 25 seconds (never past 45), in three stages with a stage line and a progress bar, drawn as an old CRT (see the CRT look row). 1. Power-on test: the title and subtitle type on, then a bank of backlit annunciator plates (five columns, one for each state a lamp can show, labelled Online, Attention, Warning, Danger, OK) sweeps on column by column with a tick each, and the whole bank flashes twice. 2. Subsystems: nine lines, one at a time, each running its real check as it appears: core, a live ESI request with its real round trip, Tranquility's player count from that same request, the active character, how many pilots are signed in, a lookup against the local systems cache, a read of the local kill store (kills in the last hour), whether the kill stream has polled, and the deck. 3. Login: once every check has answered, a session window opens (see the next row). It holds for four seconds, then everything but the logo fades out, the logo floats to the exact middle of the screen and glows while the ship's voice says "Data sequenced, connected to Vesper", and the whole sequence fades out as the app fades in behind it (the app's own fade-in is `data-boot-fade` in the stylesheet). Any key or click skips it; failures say so. | `premium/BootSequence.tsx`, `lib/diagnostics.ts`, `SettingsPage.tsx` |
| **Login window** | The last screen of the startup sequence, laid out as a console session opening: a readout strip (core version, subsystems checked, ESI round trip, live UTC clock, pilot, current system and ship, link state), the VΞSPER wordmark, AUTHENTICATION SEQUENCE COMPLETE with six lines, the fault summary, WELCOME BACK, CAPSULEER with the pilot's name, and a VΞSPER // OPERATIONAL banner. IDENTITY is the signed-in character, ACCESS LEVEL is whether that pilot's sign-in is still good (the location lookup says so), SYSTEM HEALTH is every check passing, SENSOR NETWORK is the kill stream, TACTICAL INTELLIGENCE is the local kill store, NAVIGATION CORE is the map index. A side column shows the signed-in pilots with portraits, system status, and network figures (ESI latency, pilots online, requests sent, answered and failed from the real counters, and the last hour's kill rate as a trace). A failed check changes its line, lists the fault, and the banner reads DEGRADED. Narrower than 880 px the side column is dropped. The active pilot is always listed first, with a count of any others. | `premium/LoginWindow.tsx`, `premium-signal.css` |
| **Fit to the window** | The whole startup sequence, terminal and login window, scales to the window it is showing in at that moment: up to fill a 1080p or 4K screen or a full-screen window (the login window reaches about 3.6 times its natural size, the terminal 3), and down to fit a small or windowed one (not below half). It follows the window live, so resizing, maximising, full screen, browser zoom, or dragging to a monitor with a different pixel density all re-fit it; checked from 900x600 up to 3840x2160, including while it was playing. Every block of the login window is laid out from its first frame and only revealed on cue, so it never changes size while it plays. | `premium/LoginWindow.tsx` (`useFitScale`), `premium-signal.css` |
| **Console sounds** | The startup sequence has its own synthesised soundtrack: an old industrial computer coming up, all mechanical and nothing melodic (no beeps, bells or chords, which sounded cheerful). Built from oscillators and filtered noise, so there are no samples to license. Pieces: a low gritty hum with a slow tremolo and fan noise under the whole run; key clacks like a heavy typewriter or an old buckling-spring keyboard (a sharp strike, a body thock, a thud, a faint ring of metal, three voices mixed at random so no two keys match, a heavier space bar); a printed line is a quick run of clacks and a carriage return (a quickening ratchet, then a clunk); heavy solenoid and contactor slams for the lamp bank (one per column, two when it flashes) and for each stage change (a quickening cascade of slams with a low rumble); a single firm stamp when a check passes and a harsh two-saw buzzer with a slam when one fails; the subtitle and welcome type on with clacks; and a dark hollow open fifth, low and slow, with a final slam and carriage return when the session goes operational. A limiter keeps the layers from clipping, and it follows the notification volume slider. It plays at Minimal and Full and is silent at Off, so a deck whose Sound default is Off (Corporate Future, White Phosphor) stays quiet until you turn Sound up. The window is started with `--autoplay-policy=no-user-gesture-required` (in `tauri.conf.json`), because the sequence plays at launch before anything has been clicked and the browser would otherwise keep audio muted. Mixed so the clacks lead: bright and metallic (a hard strike, a snap of top end, two short rings of metal, a rebound), with the hum, thumps and drone kept well down underneath, and every printed line a burst of 14 to 16 clacks; measured on the offline render, about a quarter of the energy is above 1 kHz where before the rebalance it was about 1%. Checked by rendering the same code offline (peak 0.81, no clipping, a WAV was sent for listening) and by counting live sound events during a run; I have not heard it myself. | `lib/bootSound.ts`, `lib/cues.ts` (`consoleSoundEnvironment`), `BootSequence.tsx`, `LoginWindow.tsx` |
| **Ship's voice** | The end of the startup says "Data sequenced, connected to Vesper." in a calm, warm British female voice (a British voice drops the final r, so it reads "Vespa"), from a short audio clip played through the same audio engine as the console sounds. It is a recording rather than live speech because the app's webview has no speech voices of its own, and a clip sounds the same on every machine. It was made once from a system voice (Microsoft Hazel) with SSML for the pause after "sequenced", then processed in the app window's own audio engine (a little slower and lower, warmth and air in the tone, a trace of ring-modulated edge and a doubled comb for a synthetic sheen, a long soft room); that is a ship's-AI feel, not a copy of any game's voice. Checked with Windows' own speech recogniser (it hears the raw take word for word at 0.98 and the processed one, with Vesper as Vespa, at 0.91), not by ear. Plays when Sound is not Off; with Sound Off the sequence keeps the same pacing in silence. Re-make or swap the clip by replacing `src/assets/sounds/data-sequenced-connected.wav`. | `lib/bootVoice.ts`, `BootSequence.tsx` |
| **CRT look** | The startup sequence is drawn as the screen of an old ship's console, after the terminals in the Alien films (the look cool-retro-term reproduces). Coloured by whichever theme you last used (the glow, the bar, the panels and the text all come from the deck's own accent and panel colours, so Holographic is cyan, Amber Command amber, Mecha Command Alert orange-red and so on), with a glow on every letter; a power-on where a bright line opens out to the picture, with a degauss thump; scanlines; a soft bar of brightness rolling down the tube; crawling static; a slow uneven flicker; random brief dips in brightness, sideways shakes and flashes of red and cyan colour fringing, each with a crackle; a burst of static and a shake at each change between stages; new lines light up bright and settle like phosphor; a vignette, a sheen of glass and a rounded bezel. Status lamps and words keep their real colours. Always on during the startup, whatever the CRT, Scanlines, Grain and Flicker settings say. Measured in the running app at the full window size: no dropped frames (worst frame 29 ms over 1,535). Screen curvature is a rounded bezel and vignette rather than true barrel distortion, which would be too heavy for a full-screen display. | `premium/BootCrt.tsx`, `premium-signal.css` |
| **Sound cues** | Seven synthesised cues (Web Audio, no sample files): confirm, panel, target lock, warning, scan complete, route warning (the startup sequence has its own soundtrack, see Console sounds). The Sound setting (Off, Minimal, Full) decides which play; Minimal is warnings only. Volume follows the notification volume. | `lib/cues.ts` |

New Effects setting: **Sound cues** (Off / Minimal / Full, default Minimal).

## Signal systems, round four (premium decks only)

Same rule as above: real data only, premium tier only. Status grammar for everything
in this section: a calm lit grey lamp with "OK" means nothing needs you; amber means it
needs a look; red with a square means act now. The state is always carried by a shape
and a word as well as colour (circle OK, triangle caution, square danger).

| System | What it does | Where |
|---|---|---|
| **Acknowledge lamp** | A blinking danger lamp or chip is a button: click, Enter or Space turns it steady (it is still red) until the condition clears. Remembered per lamp for the session. | `premium/StatusLamp.tsx`, `StatusChip.tsx`, `Annunciator.tsx` |
| **Calm state** | Annunciators, the dashboard zones and the pilot header read "OK" in a lit grey lamp when nothing is abnormal, instead of going dark. Each pilot card has one state lamp. | `Annunciator.tsx`, `PremiumDashboard.tsx`, `PremiumCharacterHeader.tsx`, `CharacterCard.tsx` |
| **Rolling numbers** | ISK, SP and wallet totals roll digit by digit when they change. First paint is static; Motion Off swaps instantly. | `premium/RollingNumber.tsx` |
| **Panel boot-up** | The first time a page opens in a session, its top-level panels stage in 60 ms apart over 400 ms. Motion Full only. | `App.tsx` (`visitedPages`), `premium-signal.css` |
| **Chart trace** | Price and activity line charts draw themselves in once when they first appear (stroke offset on a normalised path length). | `MarketHistoryChart.tsx`, `MiniPriceChart.tsx`, `ActivityGraphs.tsx`, `Sparkline.tsx` |
| **Dotted route** | A route you are only planning draws as a row of dots; once you push it to the game it draws solid. The standard themes always draw it solid. | `MapView.tsx` |
| **Grid labels** | The map's own coordinates (the same units as the cursor's GRID readout) along the top and left edges at round steps that adapt to zoom and follow pan. Map Filters: Grid Labels (on by default). | `MapView.tsx`, `useMapDisplayPrefs.ts` |
| **Tracked threat rings** | A dashed ring around each tracked system, so a watched system is findable at any zoom. | `MapView.tsx` |
| **Likely camp rings** | Rings on the gates the camp detector flags, from the same data as Likely Gate Camps. Off by default (Map Filters: Likely Camps). | `MapView.tsx`, `loadLikelyCamps` |
| **Standing shapes** | In standings territory mode, each sovereign system whose holder you have a standing with gets a ring whose shape says what the standing is (diamond hostile, square friendly, circle neutral), repeating the colour. Holders with no standing data draw nothing, same as the territory fill. Batched into one path per tier. | `MapView.tsx` |
| **Gate icons** | A small gate (two posts and a lintel) beside every system on the active route, up to 80 systems, so a route reads as a run of gates. | `MapView.tsx` |
| **Scan ring** | Pressing the map's refresh button sends two rings out across the map from the selected system (else your location, else the middle). Plays once; gone at Motion Off. Automatic 30-second refreshes stay quiet. | `MapView.tsx` |
| **HUD parallax** | The map's HUD brackets and reticle drift up to 3 px against the pointer. Motion Full only. | `MapView.tsx`, `premium-signal.css` |
| **NET chip** | A topbar counter of ESI requests sent, answered and failed this session, counted in Rust around every ESI send (not estimated). | `net_stats.rs`, `esi.rs`, `get_net_stats`, `hooks/useNetActivity.ts`, `TopBar.tsx` |
| **Route command** | Ctrl+K: type a route between two systems and the map plots it and opens. | `CommandPalette.tsx`, `lib/routeRequest.ts`, `MapPage.tsx` |
| **Page shortcuts** | Alt+1..9 jump to the sidebar's pages in order; the sidebar tooltips show the key. | `Sidebar.tsx` |
| **Capital gauges** | The capital route panel shows a progress arc for the route and a banded fatigue bar with the real thresholds. | `ProgressArc.tsx`, `CapitalRoutePanel.tsx` |
| **Fitting bullet gauges** | CPU, powergrid and calibration resource gauges are bullet graphs: a bar against the limit with the over-limit part marked. | `FitBuilder.tsx` |
| **Kill timeline** | Gate and system killboards get a timeline of kills across the window, bucketed from the kills' own times. | `KillTimeline.tsx`, `GateKillboard.tsx`, `SystemKillboard.tsx` |
| **Kill component health** | Kill detail shows, per slot group, one cell per item: red where it was destroyed, green where it dropped. Counted from the killmail's own items; charges are not counted as modules. | `KillComponentHealth.tsx`, `KillDetailView.tsx` |
| **Dashboard rack** | The dashboard modules can be moved earlier or later within their own row with the arrows in each title bar. The order is saved; Reset layout restores it. A saved order that no longer matches falls back to the default. | `PremiumDashboard.tsx`, `ScreenHousing.tsx` |
| **Job lanes** | Industry jobs on one time axis, a lane per activity, a bar from start to end filled to the share elapsed, a marker for now, and a triangle on finished jobs awaiting delivery. Built from the same jobs as the table beneath it. | `JobLanes.tsx`, `CharacterDetail.tsx` |
| **PI colony board** | One tile per colony, most urgent first: a lamp for every extractor (grey running, amber under six hours left, red stopped), a bar for the program finishing first, and how long ago a stopped one ended. It does not draw links or storage fill, because the backend does not read them from ESI. Checked against fixture data only. | `PiBoard.tsx`, `PlanetaryColonies.tsx` |
| **Stale mark and mail sync** | A triangle plus the age beside data that has stopped refreshing, and a sync readout on the mail page. | `StaleMark.tsx`, `MailPage.tsx` |
| **Boot vocabularies and sound packs** | Each deck's startup sequence uses its own wording; sound cues use a per-deck pack. | `BootSequence.tsx`, `lib/cues.ts` (`SOUND_PACKS`) |
| **Deck touches** | Bulkhead stencilled section labels (Stardos Stencil), Cassette Deck screw heads, smoked-glass panels on the glass family. | `premium-decks-extra.css`, `premium-signal.css` |
| **Ticker tiers** | The map's live ticker and the news ticker rows get tiers from their own data (tier 1 lit rail, tier 3 dimmed until hover or focus), the same grammar as the kill feed. | `LiveActivityTicker.tsx`, `premium-signal.css` |
| **Tracking boxes** | Four corner brackets close in on the kill row or map ticker row under the pointer or keyboard focus. Drawn as one pseudo-element; Motion Off draws them without the closing-in. | `premium-signal.css` |
| **Lamp test and type-on boot** | The startup sequence's lamp bank shows every state a lamp can show, and its title and subtitle type on with a block caret. The command line's caret is a solid block. The sounds that go with it are in the Console sounds row. | `BootSequence.tsx`, `premium-signal.css` |
| **Ticker keyboard pause** | The mineral ticker pauses on keyboard focus as well as hover. This one is in `App.css`, so it applies to every theme (accessibility, no visual change otherwise). | `App.css` |

Fonts added for this round: Stardos Stencil joins the earlier faces (bundled `@fontsource`).

Not built, with the reason: hull silhouettes and vector diagrams (need artwork the app
does not have), a WebGL CRT layer (the app is DOM, there is nothing to post-process),
mono numerals in the standard themes (those stay untouched by decision), a drive-access
light (no real signal behind it), sparklines in the market screener (a price series per
row would be one ESI history call per row), a mining-to-market flow diagram (would
restate the ore table's numbers), industry slot utilisation (needs skill data the app
does not load), PI links and storage fill (the backend does not read them).

Not exercised live: standing shapes, capital gauges, fitting bullet gauges, stale mark and
mail sync, boot vocabularies and sound packs outside the first deck, Bulkhead stencil and
Cassette screws, HUD parallax, sound by ear, PI timer on a real colony.
