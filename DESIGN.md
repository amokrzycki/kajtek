---
name: KAJTEK Radio
description: A faithful digital reissue of the Unitra PS-101 PRL cassette player, reborn as a lightweight internet radio.
colors:
  bakelite-red: "#c4251b"
  bakelite-red-bright: "#d83428"
  bakelite-red-text: "#a81c14"
  paper-bg: "#eeebe3"
  paper-bg-sub: "#e6e2d9"
  paper-bg-panel: "#e9e5dc"
  paper-bg-raised: "#f0ede5"
  paper-bg-inset: "#d2cdc3"
  paper-bg-deep: "#c4bfb4"
  ink: "#272320"
  ink-2: "#4c4641"
  ink-muted: "#56504a"
  ink-faint: "#5b5650"
  ink-disabled: "#8d8880"
  led-live: "#15803d"
  led-next: "#b45309"
  led-off: "#b9b3aa"
  display-well: "#100d0b"
  display-text: "#ffffff"
  display-accent: "#ffd54f"
  display-live: "#4ade80"
  glass-red: "#3a1410"
  glass-green: "#1c2a0c"
  glass-yellow: "#33260a"
  glass-blue: "#12263a"
  glass-pink: "#34161f"
  glass-black: "#26231d"
  shell-red-lit: "#e03228"
  shell-green-lit: "#a6c53a"
  shell-green: "#7f9e1c"
  shell-yellow-lit: "#fac83c"
  shell-yellow: "#e6a608"
  shell-blue-lit: "#74aee0"
  shell-blue: "#4d88c6"
  shell-pink-lit: "#f6b3bf"
  shell-pink: "#e88fa2"
  shell-black-lit: "#3a3733"
  shell-black: "#1d1b19"
  shell-black-dark-lit: "#4b4741"
  shell-black-dark: "#302d29"
  shell-black-dark-edge: "#777066"
  vu-green: "#16a34a"
  vu-amber: "#d97706"
  vu-red: "#dc2626"
  warning-amber: "#f59e0b"
  brand-plate-lit: "#f8f8fa"
  brand-plate-mid: "#e2e2e8"
  brand-plate-shade: "#d4d4dc"
  tape-brown: "#5a3726"
  tape-brown-deep: "#2a1810"
  reel-spoke: "#38322b"
typography:
  display:
    fontFamily: "Chakra Petch, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 700
    letterSpacing: "0.15em"
  body:
    fontFamily: "IBM Plex Mono, monospace"
    fontSize: "0.875rem"
  label:
    fontFamily: "IBM Plex Mono, monospace"
    fontSize: "0.75rem"
    letterSpacing: "0.18em"
    fontWeight: 500
rounded:
  sm: "7px"
  md: "9px"
  lg: "11px"
  hairline: "1px"
  hardware: "3px"
  chip: "5px"
  panel: "10px"
  pill: "999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "32px"
components:
  button-key:
    backgroundColor: "{colors.paper-bg-raised}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.sm}"
  button-key-active:
    backgroundColor: "{colors.bakelite-red}"
    textColor: "{colors.bakelite-red-text}"
    rounded: "{rounded.sm}"
  button-primary:
    backgroundColor: "{colors.bakelite-red}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "0.45rem 0.9rem"
  button-primary-hover:
    backgroundColor: "{colors.bakelite-red-bright}"
  button-secondary:
    backgroundColor: "{colors.paper-bg-inset}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0.45rem 0.75rem"
  station-card:
    backgroundColor: "{colors.paper-bg-panel}"
    rounded: "{rounded.lg}"
    padding: "12px"
---

# Design System: KAJTEK Radio

## Overview

**Creative North Star: "The Unitra PS-101 Reissue"**

KAJTEK is not "retro-inspired" in the abstract — it is a literal, part-by-part digital reissue of one specific object: the Unitra PS-101, a PRL-era (Polish People's Republic) cassette tape player. Every zone of the interface maps to a physical part of that machine: a red bakelite case with side buttons, a dark glass display window with tape-counter styling, spinning tape reels with visible sprocket hubs, a VU meter with an LED-style level ladder, and a control strip with a mechanical play button and branding plate ("UNITRA zrk · STEREO · CASSETTE PLAYER PS 101"). The system does not decorate a generic music-player layout with retro colors — the layout itself *is* the cassette deck, and the underlying app (station catalog, Smart Listening) lives inside it like tape running through the mechanism.

The base palette is warm, worn paper — cream/beige surfaces with soft warm-gray text — punctuated by a single insistent bakelite red. That red is swappable: six named case-shell colors (red, green, yellow, blue, pink, black) let a user pick a different plastic shell, Walkman-style, without changing the machine underneath. The display window never follows the room: it's always a dark glass well, regardless of light/dark theme, and only the plastic around it decides its tint — a real cassette deck's window doesn't change with the lighting, but it is moulded with the shell.

Depth is physical, not decorative. Every raised element (buttons, knobs, the case itself) casts a soft directional shadow and gets a bright inset highlight along its top edge, as if lit from above; every pressed or "active" state inverts to an inset well shadow, as if the object is now recessed. Nothing floats on a flat color field — everything looks like it could be touched.

**Key Characteristics:**
- Literal hardware reissue, not generic retro pastiche — case, display, reels, VU meter, control strip all map to real PS-101 parts.
- Warm paper neutrals + one insistent bakelite accent, with six swappable case-shell colors.
- Display window is always dark glass, immune to the light/dark theme and tinted only by the case shell.
- Physical button-press realism: raised keys with highlight-and-shadow, inset wells on press/active, contact shadow lifting the whole case off the page.
- Two type voices: a bold display face for brand/station names (Chakra Petch), a mono face for everything data/label-like (IBM Plex Mono) — the pairing reads as "front panel silkscreen + LCD readout."

## Colors

Warm, worn paper neutrals carry the app; a single bakelite red is the one color allowed to feel urgent, echoed by a small LED-status vocabulary (live/next/off) inside the display and station list.

### Primary
- **Bakelite Red** (`#c4251b`, `--k-accent`): the default case-shell color and the one accent used for active/selected/"live" state across the whole app — play button glow, active station card LED, focused inputs, primary buttons. Six alternate shells exist (`green` `#7f9e1c`-family, `yellow` `#e6a608`-family, `blue` `#4d88c6`-family, `pink` `#e88fa2`-family, `black` `#1d1b19`-family) — each one re-themes `--k-accent`, `--k-case`, and the display's glow, as a genuine hardware color swap, not a rebrand.
- **Bakelite Red Bright** (`#d83428`, `--k-accent-2`): hover/pressed variant of the accent, and the ring/glow color around focused or playing elements.

### Neutral
- **Warm Paper** (`#eeebe3`, `--k-bg`): app background, with a barely-visible 24px pinstripe grid overlaid (`--k-grid-line`) — the one textural nod to graph paper / schematic paper.
- **Panel Cream** (`#e9e5dc`, `--k-bg-panel`) / **Raised Cream** (`#f0ede5`, `--k-bg-raised`): card and control surfaces one step lighter/darker than the base, used to separate raised (button) from recessed (panel) zones.
- **Inset Stone** (`#d2cdc3`, `--k-bg-inset`) / **Deep Stone** (`#c4bfb4`, `--k-bg-deep`): pressed/active surfaces and input wells — always paired with an inset shadow.
- **Ink** (`#272320`, `--k-text`) through **Faint Ink** (`#6b665f`, `--k-text-faint`): a five-step warm-gray text scale, darkest for primary copy, lightest for de-emphasized labels.

### Display Well (dark always, tinted by shell)
- **Display Well** (`#100d0b`, `--k-disp-well`) with a `linear-gradient(155deg, #3a1410, #140806)` background (`--k-disp-bg`, the red-shell default): the LCD/tape-counter glass. Text inside is white/near-white (`--k-disp-text` `#fff`, `--k-disp-text-2` `#e2e8f0`), with **Amber Track Accent** (`#ffd54f`, `--k-disp-accent`) for artist/short-code text — the one warm-tungsten note against the cool glass.

### Shell Glass Tints
Each case shell overrides `--k-disp-bg` (and the empty-artwork gradient `--k-art-empty`) in `styles/themes.css` with a glass moulded to that plastic: a 155° gradient from a dark, shell-hued top stop to a near-black bottom stop. Red is the default in `variables.css`; the six overrides are the tokens below, each the top stop of its glass.
- **Smoked Red** (`#3a1410` → `#140806`), **Smoked Green** (`#1c2a0c` → `#080d04`), **Smoked Amber** (`#33260a` → `#110c03`), **Smoked Blue** (`#12263a` → `#050b13`), **Smoked Rose** (`#34161f` → `#130709`), **Smoked Graphite** (`#26231d` → `#0b0a08`).
- Empty-artwork gradients follow the same tint: a near-black edge, a saturated mid-stop, a near-black edge (red `#1a0a05 / #7a2808 / #2a1005`, green `#0d1405 / #3f5a0c / #131c05`, amber `#150e02 / #6b4805 / #1e1403`, blue `#04101c / #0d456f / #061620`, rose `#1a0810 / #6e2340 / #200a12`, graphite `#100f0c / #4a3d16 / #16140f`).

### Shell Plastics
Case gradients (`--k-case`, 180°, lit top → shaded base) are literal per shell, declared only in `themes.css`: red `#e03228 → #c4221a`, green `#a6c53a → #7f9e1c`, yellow `#fac83c → #e6a608`, blue `#74aee0 → #4d88c6`, pink `#f6b3bf → #e88fa2`, black `#3a3733 → #1d1b19`. Each shell also sets `--k-u-box-fg`, the UNITRA box lettering, from its own plastic.

### Hardware Colors (untokenised)
Literals that live in component CSS or `variables.css` rather than a `--k-*` token. They are deliberate depictions of physical parts, not drift, and are documented here so new work reuses them instead of inventing neighbors.
- **VU ladder** (`--k-vol-1..3`, light theme): green `#4ade80 → #16a34a`, amber `#fbbf24 → #d97706`, red `#f87171 → #dc2626`. Dark theme swaps to flat `#4ade80`, `#ffeb3b`, `#ef5a4a`.
- **Warning Amber** (`#f59e0b`, as `rgba(245, 158, 11, 0.12–0.6)` tints): Smart Listening warning banner and negative-music rows in the history playlist — the same hue as Next Amber, used only as translucent fill, border and glow.
- **Brand plate** (`linear-gradient(180deg, #f8f8fa, #e2e2e8 50%, #d4d4dc)`): the brushed-metal UNITRA strip, cool grey by design against the warm paper.
- **Tape and reel** (`#5a3726` → `#2a1810` radial wound tape, `#38322b` spokes, `#000000` alternating hub teeth): the cassette reels inside the glass.
- **Scrim blacks** (`rgba(0, 0, 0, α)`, α 0.18 – 0.9): modal backdrop (0.65), history panel backdrop (0.5), artwork and reel vignettes (0.45–0.6), display text-shadow (0.8–0.9), stripe and card hairline shading (0.18–0.28). Always neutral black; never tinted.

### Status LEDs
- **Live Green** (`#15803d`/`#4ade80` dark) — a station currently airing live content.
- **Next Amber** (`#b45309`/`#f59e0b` dark) — an upcoming/queued item.
- **Off Gray** (`#b9b3aa`) — inactive.

### Named Rules
**The One Well Rule.** The display window (`--k-disp-*` tokens) is always dark glass, and light/dark theme never changes it. The case shell may tint it: each of the six shells overrides `--k-disp-bg` and `--k-art-empty` with a smoked glass in its own hue, and nothing else about the well moves. Precisely: (1) the glass stays dark in every theme and shell — the brightest tint stop is `#3a1410`, and no tint may exceed roughly that lightness; (2) `.dark` and `:root` never redefine `--k-disp-bg`, `--k-disp-well`, or `--k-disp-text*`; only `[data-case]` selectors may, and only for the background gradient and empty-artwork gradient; (3) text, accent, live and next colors inside the well (`--k-disp-text`, `--k-disp-accent`, `--k-disp-live`) are identical across shells. The history panel shares the fixed dark well color (see Components); other surfaces theme-swap, and only the display gradient shell-tints.

**The Shell, Not Skin Rule.** Case-color variants (`[data-case="..."]`) re-theme the accent, case gradient, display glass tint, and glow together as one unit — never recolor `--k-accent` independently of `--k-case`. They're alternate physical shells, not independent brand palettes.

## Typography

**Display Font:** Chakra Petch (with sans-serif fallback)
**Body Font:** IBM Plex Mono (with monospace fallback)

**Character:** A geometric, slightly technical display face (Chakra Petch, weights 500–700, wide letter-spacing) reads as engraved front-panel lettering — brand name, station names, the "STEREO" outline wordmark. IBM Plex Mono carries everything else — labels, metadata, buttons, timestamps — reading as an LCD/terminal readout. The pairing is deliberately "silkscreen panel + digital display," never a soft editorial serif/sans pair.

Fonts load from Google Fonts through HTML stylesheet links with preload and preconnect hints, using `display=swap`. Keep the same links on the player and both legal pages; do not load remote fonts through CSS `@import`.

### Hierarchy
- **Brand** (700, 2.5rem, tracking 0.15em): the "KAJTEK" wordmark in the header.
- **Display / Station Name** (700, 1.95rem, line-height 1.2): the now-playing station name inside the display glass; `overflow-wrap: anywhere` so long Polish station names never overflow the window.
- **Compact Heading** (`--k-fs-heading`, 1.5rem): mobile station name, STEREO lettering, and modal close glyph.
- **Numeric / Modal Heading** (`--k-fs-num`, 1.2rem): timer numbers and modal titles.
- **Lead** (400–600, 1.05rem): track title inside the display.
- **Card Title** (600, 1.02rem): station name on a station card.
- **Body** (`--k-fs-body`, 400, 0.875rem / 14px): default UI copy, forms, and playlist titles.
- **Label** (`--k-fs-label`, 500–700, 0.75rem / 12px, tracking 0.18em, uppercase): section headers, panel labels (`k-label`) — always mono, always wide-tracked, always uppercase.
- **Data** (`--k-fs-data`, 0.75rem / 12px): metadata, timestamps, durations, and secondary controls.
- **Tag** (`--k-fs-tag`, 0.75rem / 12px): counts and status badges, including playlist status tags, custom-station badges, and warning tags. Keep this size on mobile; do not shrink badges below the informational-text floor.
- **Hardware** (`--k-fs-hardware`, 0.5rem): decorative tape ruler, UNITRA/model silkscreen, and disclosure arrow only; never actionable labels or listener information.
- **Artwork** (`--k-fs-art`, 3.4rem): decorative empty-cover glyph.

Informational text uses a 12px minimum at the default root size, including mobile. Label, data, and tag roles share this floor; weight, tracking, color, and placement distinguish them. Sizes use the role tokens above; the mobile header wordmark alone interpolates between the heading and display tokens with `clamp()`.

### Named Rules
**The Descender Rule.** Station-name line-height is fixed at 1.2 specifically to leave room for Polish descenders (ą, ę, j, y) inside the tight display glass — never tighten this for a denser look.

## Layout

Single-column app shell, capped at `max-width: 860px`, centered, laid over a faint 24px pinstripe grid (`--k-grid-line`) that reads as graph-paper/schematic backing rather than a texture. The player itself is a fixed-zone hardware panel: a CSS grid (`30px 44px 128px 1fr 44px 22px` on desktop) assigns fixed-width columns to the tape-scale ruler, left reel, brand stripe, track info, right reel, and edge margin — a literal deck layout, not a flexible content flow. Below the player, `.controls-row` is a two-column grid (volume / sleep timer) collapsing to one column under 560px. Station list and toolbar follow beneath.

**Responsive behavior:** at 640px the display's grid collapses from six columns to three (`44px 1fr 44px`) with named grid-areas (`reel-l art reel-r` / `info info info`), hiding the desktop-only brand stripe and tape-scale ruler entirely rather than shrinking them — mobile gets a simplified deck face, not a squeezed one.

**Spacing scale (`--k-s1`…`--k-s5`):** 8 / 12 / 16 / 20 / 32px, a scale of 4, used consistently for panel padding and inter-section gaps.

## Elevation & Depth

**Physical button-press realism.** Nothing is flat-with-a-drop-shadow; every raised control simulates a real embossed object and every active/pressed control simulates the same object pushed in. Buttons carry a compound shadow (`--k-sh-btn`: inset top highlight + inset bottom shade + soft outer shadow) that reads as a slightly domed key; pressing swaps it for `--k-sh-inset` (two inward shadows, no outer glow) and nudges the element down 1px via `translateY`. The case itself gets `--k-sh-contact`, a warm, wide contact shadow that lifts the whole red shell off the paper background as if it were a physical object resting on a desk.

### Shadow Vocabulary
- **Small** (`--k-sh-sm`): default card/panel shadow — subtle lift for at-rest surfaces.
- **Medium** (`--k-sh-md`): station card hover, modal shadow — a stronger lift for hovered/foreground elements.
- **Inset** (`--k-sh-inset`): pressed buttons, active station cards, input wells — the "pushed in" state.
- **Button** (`--k-sh-btn`): the compound raised-key shadow for every clickable key-like control.
- **Contact** (`--k-sh-contact`): the case's own warm ambient shadow against the page — tinted toward the current case color, not neutral black.

### Named Rules
**The Push-In Rule.** Every interactive control's "active/pressed" state is expressed as a shadow inversion (raised → inset) plus a 1px downward shift, never as a color fill alone. A button that can't visibly "push in" isn't finished.

## Shapes

Three radii carry the app, applied by role rather than by component: `--k-r` (11px, large — panels, cards, the case itself), `--k-rc` (9px, medium — the display glass), `--k-rb` (7px, small — buttons, chips, inputs). Corners are consistently soft-rounded rather than sharp or fully circular, except deliberately circular elements that represent real round hardware: tape reels, reel hubs, the VU meter's LED-style segments, and toggle-switch knobs.

### Off-Scale Radii (untokenised)
The detector found literal radii outside the three-step scale. They are the only sanctioned exceptions; anything else should use `--k-r` / `--k-rc` / `--k-rb`.
- **Pill** (`999px`, `99px`): warning tag, history tabs, catalog "local" pill — shape that must read fully round regardless of content width. Prefer `999px`; `99px` is equivalent legacy in the catalog modal.
- **Count badge** (`10px`): the favorites tab count and station-section counts — a small badge that reads as near-pill at its fixed height.
- **Toggle track** (`999px`): the catalog modal's toggle switch, as a pill-shaped inset track.
- **Chip** (`5px`): playlist rows (including current and ad-break states) and the volume slider's track and thumb.
- **Hardware micro-radii** (`1px`–`4px`): VU columns and volume LEDs (1px), UNITRA box lettering (2px), side-button nubs (4px), brand plate, playlist tags and custom-station badges (3px). These depict small machined edges; never use them on interactive controls.

## Components

### Buttons
- **Key button** (`.btn-key`, `.sleep-key`, `.play-btn`): raised bakelite-key shape (radius `--k-rb` or 20% for round knobs), `--k-sh-btn` at rest, `--k-sh-inset` + 1px downshift on press, accent-dim fill with accent border when toggled active.
- **Primary** (`.btn-primary`): solid bakelite red, white text, hover shifts to the brighter red variant.
- **Secondary** (`.btn-secondary`): inset-stone background, hairline border, border darkens on hover — quieter than primary, used for modal actions.
- **Play button**: the deck's largest control — 68px, round-ish (20% radius), glows with the theme's accent color and `--k-glow` when playing.

### Station Card
- **Shape:** `--k-r` radius, hairline border, `--k-sh-sm` at rest.
- **Hover:** lifts 2px, upgrades to `--k-sh-md`, border darkens slightly — a physical "picked up" gesture.
- **Active/selected:** shadow inverts to `--k-sh-inset` and returns to rest position — reads as a pressed key, not a color splash. A pulsing LED dot (`.sc-led-dot`) marks the currently playing card.

### Display / "Tape Counter" Window
The signature component. A dark glass well (`--k-disp-bg`) with an etched glass overlay (`::before` pseudo-element: top/bottom pinstripe rules + diagonal reflection), flanked by two spinning tape reels with visible sprocket-hub teeth and a conic-gradient "wound tape" pattern, plus a vertical tape-scale ruler ("END · 100 · 50 · 0 · START") reading top-to-bottom in `writing-mode: vertical-rl`. Station name and track info render in white/amber against the dark glass with heavy text-shadow for legibility. Never themed by light/dark mode; tinted by case shell only — see Colors' One Well Rule.

### VU Meter
A row of vertical LED-ladder columns (`.vu-strip` / `.vu-col`) with a fixed green→yellow→red gradient zoned at 58%/84% thresholds, each column's live fill clipped by a CSS custom property (`--vu-level`) driven by Web Audio FFT data, capped with a bright white peak-hold line (`.vu-cap`).

### Toggle Switch
- **Style:** pill-shaped inset track (`--k-sh-inset`), round knob with the raised-button shadow (`--k-sh-btn`).
- **State:** 44×24px track with a contrasting outline and knob; an etched O marks off and I marks on, independently of color.
- **Checked state:** knob slides 20px right, fills accent-dim with accent-text border, knob itself becomes solid accent-text.
- **Focus:** keyboard focus on the checkbox outlines the whole switch using the shared two-color focus ring.

In dark mode, the Black shell uses a lighter charcoal gradient (`#4b4741` → `#302d29`), a warm-gray edge (`#777066`), and a deeper directional contact shadow to lift it off the page.

### Keyboard Focus
All links, buttons, inputs, selects, summaries, textareas, elements with `tabindex`, and catalog rows use `:focus-visible`: a 2px solid `--k-focus` outline offset by 2px, backed by a 2px `--k-focus-inner` shadow. Light mode uses dark ink (`#272320`) outside white (`#ffffff`); dark mode uses warm white (`#f0eae1`) outside dark ink (`#272320`). These colors are independent of the case accent so focus stays visible on colored shells and dark glass. The checkbox's ring is applied to its visible switch via `:has(.catalog-checkbox:focus-visible)`.

### History / Playlist Panel
The collapsible panel below the deck contains PLAYLISTA and favorites. `.history-inner` uses the same always-dark `--k-disp-well` (`#100d0b`) as the display's recessed well, with a 1px `--k-border-2` edge, `--k-rc` radius, and `inset 0 2px 8px rgba(0, 0, 0, 0.5)` shadow. This panel stays dark in both themes and across shells; its solid well color does not inherit the display's tinted gradient. Labels, tabs, clock, empty state, and rows use `--k-disp-*` foreground tokens. Active tabs have a `--k-disp-hair` pill background and `--k-disp-text` text. Desktop margins are `0.2rem 18px 18px`, padding `0.75rem 1rem 0.9rem`; at 640px and below use `0.2rem 12px 12px` and `0.65rem 0.65rem 0.8rem`. Expansion uses `grid-template-rows: 0fr → 1fr`.

### Inputs
- **Style:** inset-stone background and hairline border; border shifts to accent on focus. Keyboard focus also shows the shared two-color focus ring.
- **Icon-prefixed search fields** reserve left padding for an inline SVG icon.

### Modal
- **Shell:** centered overlay with blur backdrop, `--k-r` radius, scale+translateY entrance (0.94 → 1, 12px → 0) — never a slide-from-edge.
- **Header:** title in display font, close button as a bare oversized "×", optional "last updated" byline.
- **Toolbar/tabs:** underline-style active tab (2px accent border-bottom), search + view-toggle controls in a shared toolbar row.
- **Expandable forms** (custom station, music preference): animate via `grid-template-rows: 0fr → 1fr`, never `max-height` or `display` toggling.

### Navigation (Header)
Flat, no background — brand wordmark left, two icon-only round key-buttons right (dark-mode toggle with animated sun/moon swap, settings gear that spins 150° on open). Same raised-key shadow language as the rest of the app; the header is not a separate visual register.

## Do's and Don'ts

### Do:
- **Do** treat every new control as a real PS-101 hardware part first — ask "what would this be on the physical deck" before inventing a generic web-UI pattern.
- **Do** express active/pressed/playing state as a shadow inversion (raised → inset) plus a 1px shift, per the Push-In Rule.
- **Do** keep the display glass dark in both themes and let only the case shell tint it (One Well Rule) — the display and history well stay dark across themes; only the display gradient changes with case shell through the six `themes.css` glass overrides.
- **Do** pair case-shell color changes as a single unit (case gradient + accent + glow) per the Shell, Not Skin Rule — never recolor the accent alone.
- **Do** use IBM Plex Mono for anything data-like or labeled, and reserve Chakra Petch for brand/station-name display text.

### Don't:
- **Don't** introduce a flat drop-shadow-on-color-field look anywhere — every raised element needs the compound highlight+shade `--k-sh-btn` treatment, not a generic `box-shadow: 0 2px 8px rgba(0,0,0,.1)`.
- **Don't** add a new accent hue outside the six defined case-shell palettes; the whole point of the shell system is that only one saturated color is live at a time.
- **Don't** lighten a glass tint past the smoked-red top stop, or override `--k-disp-*` from `.dark` or any non-shell selector.
- **Don't** use sharp/square corners or fully flat surfaces — the three-radius system (`--k-r` / `--k-rc` / `--k-rb`) and physical shadow vocabulary are load-bearing for the "real object" illusion.
- **Don't** animate panel open/close or expandable forms with `max-height` hacks or `display: none` toggling — use `grid-template-rows: 0fr → 1fr` per the existing pattern.

## UI terminology

- **Własna stacja** describes a station added by the listener. **WŁASNE** labels the catalog tab containing these stations. Use **adres strumienia** for its playback URL.
- **PLAYLISTA** labels the panel of past, current, and upcoming tracks or broadcasts supplied by the station.
- **Ponów** retries failed playback. **Smart Listening** names the single protective-listening configuration; the deck’s **SMART** switch controls its master state. **Preferuj**, **Neutralnie** and **Unikaj** describe explicit artist/track preferences; saved stars remain bookmarks.

Smart Listening uses the incumbent modal, switch, form and paper-panel vocabulary. Keep its station pool, content policy and music preferences progressively disclosed inside one configuration. The protective status remains visible beside playback when PLAYLISTA is closed. Use the existing amber warning treatment for reasons, the existing text hierarchy for temporary/original station identity, and stable action buttons through countdown updates. A return status describes waiting for fresh suitable content; it must not imply that a timer alone proves a safe return.

### Station discovery browser

STACJE and CO TERAZ GRA? are sibling mechanical keys above the station area. The selected key uses the existing inset shadow and 1px push; Katalog stacji remains below the keys in both modes. One shared list/grid control and saved preference apply to both surfaces. The player stays in place above this area.

Discovery lists use compact artwork at the left, artist/title in the middle, and secondary station/status metadata at the right; on mobile, metadata moves beneath the artist/title. Discovery grids use wider cards than station grids, with a prominent 4:3 artwork recess above the text and secondary metadata separated by a hairline. Columns fill the available space at a minimum usable width of 240px; narrow screens use one column. Selected cards use the Push-In Rule and an accent border. Only the negative-music badge takes warning emphasis, not the whole card or unrelated statuses.

Artwork is decorative context: actual track covers take priority for songs, followed by station artwork and a deterministic station initial. News, programmes, advertisements and unknown content use station artwork rather than a previous song cover. Failed covers follow the same fallback chain. Station imagery is never labelled as album art. Artwork recesses keep their dimensions while loading; grid images fit inside the recess without cropping.

Browser-mode changes are a short mechanical handoff: the outgoing panel yields 8px and fades faster, while the incoming panel enters 12px from the logical forward direction (reversed on return). A measured-height transition softens the layout change without moving the player. Arrivals take roughly 230ms with the existing mechanical deceleration. Repeated switches replace the transition; inactive panels immediately stop accepting focus or clicks. Reduced motion switches panels instantly.

Discovery entries use the existing paper panel, radii and raised/inset shadows, with the song artist in Chakra Petch and title in IBM Plex Mono. Artist and title dominate the smaller station identity, observation time and data badges. Small badges use existing ink/accent and border tokens; they introduce no new status colors. On mobile, station metadata sits below the content. Entries keep stable button identity and keyboard focus through refreshes. Observation-time updates preserve unchanged artwork, text and badge nodes, including artwork fallbacks. Failed artwork is remembered for the current page session only; changed URLs and reloads can load fresh artwork. “Starsze dane” and “błąd danych” annotate retained snapshots; missing metadata has an explicit path back to STACJE or the catalog. Non-predicted RMF break snapshots use “reklama / przerwa (wg playlisty)” to retain timeline uncertainty; explicitly predicted breaks stay “brak danych”; “reklama” alone is reserved for explicit evidence.
