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
  ink-2: "#554e49"
  ink-muted: "#5f5a54"
  ink-faint: "#6b665f"
  ink-disabled: "#8d8880"
  led-live: "#15803d"
  led-next: "#b45309"
  led-off: "#b9b3aa"
  display-well: "#100d0b"
  display-text: "#ffffff"
  display-accent: "#ffd54f"
  display-live: "#4ade80"
typography:
  display:
    fontFamily: "Chakra Petch, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 700
    letterSpacing: "0.15em"
  body:
    fontFamily: "IBM Plex Mono, monospace"
    fontSize: "0.78rem"
  label:
    fontFamily: "IBM Plex Mono, monospace"
    fontSize: "0.65rem"
    letterSpacing: "0.18em"
    fontWeight: 500
rounded:
  sm: "7px"
  md: "9px"
  lg: "11px"
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

KAJTEK is not "retro-inspired" in the abstract — it is a literal, part-by-part digital reissue of one specific object: the Unitra PS-101, a PRL-era (Polish People's Republic) cassette tape player. Every zone of the interface maps to a physical part of that machine: a red bakelite case with side buttons, a dark glass display window with tape-counter styling, spinning tape reels with visible sprocket hubs, a VU meter with an LED-style level ladder, and a control strip with a mechanical play button and branding plate ("UNITRA zrk · STEREO · CASSETTE PLAYER PS 101"). The system does not decorate a generic music-player layout with retro colors — the layout itself *is* the cassette deck, and the underlying app (station catalog, ad-skip, blacklist) lives inside it like tape running through the mechanism.

The base palette is warm, worn paper — cream/beige surfaces with soft warm-gray text — punctuated by a single insistent bakelite red. That red is swappable: six named case-shell colors (red, green, yellow, blue, pink, black) let a user pick a different plastic shell, Walkman-style, without changing the machine underneath. The display window is the one zone that never swaps: it's always a dark glass well, regardless of theme or case color, because a real cassette deck's window doesn't change with the room.

Depth is physical, not decorative. Every raised element (buttons, knobs, the case itself) casts a soft directional shadow and gets a bright inset highlight along its top edge, as if lit from above; every pressed or "active" state inverts to an inset well shadow, as if the object is now recessed. Nothing floats on a flat color field — everything looks like it could be touched.

**Key Characteristics:**
- Literal hardware reissue, not generic retro pastiche — case, display, reels, VU meter, control strip all map to real PS-101 parts.
- Warm paper neutrals + one insistent bakelite accent, with six swappable case-shell colors.
- Display window is a fixed dark glass well — the one surface immune to theme and case-color changes.
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

### Display Well (theme-invariant)
- **Display Well** (`#100d0b`, `--k-disp-well`) with a `linear-gradient(155deg, #3a1410, #140806)` background: the LCD/tape-counter glass. Text inside is white/near-white (`--k-disp-text` `#fff`, `--k-disp-text-2` `#e2e8f0`), with **Amber Track Accent** (`#ffd54f`, `--k-disp-accent`) for artist/short-code text — the one warm-tungsten note against the cool glass.

### Status LEDs
- **Live Green** (`#15803d`/`#4ade80` dark) — a station currently airing live content.
- **Next Amber** (`#b45309`/`#f59e0b` dark) — an upcoming/queued item.
- **Off Gray** (`#b9b3aa`) — inactive.

### Named Rules
**The One Well Rule.** The display window (`--k-disp-*` tokens) never changes with light/dark theme or case-shell color — it is always the same dark glass, because a real tape deck's window doesn't repaint itself. Every other surface theme-swaps; this one doesn't.

**The Shell, Not Skin Rule.** Case-color variants (`[data-case="..."]`) re-theme the accent, case gradient, and glow together as one unit — never recolor `--k-accent` independently of `--k-case`. They're alternate physical shells, not independent brand palettes.

## Typography

**Display Font:** Chakra Petch (with sans-serif fallback)
**Body Font:** IBM Plex Mono (with monospace fallback)

**Character:** A geometric, slightly technical display face (Chakra Petch, weights 500–700, wide letter-spacing) reads as engraved front-panel lettering — brand name, station names, the "STEREO" outline wordmark. IBM Plex Mono carries everything else — labels, metadata, buttons, timestamps — reading as an LCD/terminal readout. The pairing is deliberately "silkscreen panel + digital display," never a soft editorial serif/sans pair.

### Hierarchy
- **Brand** (700, 2.5rem, tracking 0.15em): the "KAJTEK" wordmark in the header.
- **Display / Station Name** (700, 1.95rem, line-height 1.2): the now-playing station name inside the display glass; `overflow-wrap: anywhere` so long Polish station names never overflow the window.
- **Lead** (400–600, 1.05rem): track title inside the display.
- **Card Title** (600, 1.02rem): station name on a station card.
- **Body** (400, 0.78rem): default UI copy.
- **Label** (500, 0.65rem, tracking 0.18em, uppercase): section headers, panel labels (`k-label`) — always mono, always wide-tracked, always uppercase.
- **Tag** (0.54rem): smallest data, e.g. catalog tab counts.

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

Three radii for the entire app, applied by role rather than by component: `--k-r` (11px, large — panels, cards, the case itself), `--k-rc` (9px, medium — the display glass), `--k-rb` (7px, small — buttons, chips, inputs). Corners are consistently soft-rounded rather than sharp or fully circular, except deliberately circular elements that represent real round hardware: tape reels, reel hubs, the VU meter's LED-style segments, and toggle-switch knobs.

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
The signature component. A dark glass well (`--k-disp-bg`) with an etched glass overlay (`::before` pseudo-element: top/bottom pinstripe rules + diagonal reflection), flanked by two spinning tape reels with visible sprocket-hub teeth and a conic-gradient "wound tape" pattern, plus a vertical tape-scale ruler ("END · 100 · 50 · 0 · START") reading top-to-bottom in `writing-mode: vertical-rl`. Station name and track info render in white/amber against the dark glass with heavy text-shadow for legibility. Never themed by light/dark mode or case color — see Colors' One Well Rule.

### VU Meter
A row of vertical LED-ladder columns (`.vu-strip` / `.vu-col`) with a fixed green→yellow→red gradient zoned at 58%/84% thresholds, each column's live fill clipped by a CSS custom property (`--vu-level`) driven by Web Audio FFT data, capped with a bright white peak-hold line (`.vu-cap`).

### Toggle Switch
- **Style:** pill-shaped inset track (`--k-sh-inset`), round knob with the raised-button shadow (`--k-sh-btn`).
- **Checked state:** knob slides 14px right, fills accent-dim with accent border, knob itself becomes solid accent.
- **Focus:** accent-ring glow around the whole switch, never just an outline.

### Inputs
- **Style:** inset-stone background, hairline border, no visible focus ring — border color shifts to accent on focus instead.
- **Icon-prefixed search fields** reserve left padding for an inline SVG icon.

### Modal
- **Shell:** centered overlay with blur backdrop, `--k-r` radius, scale+translateY entrance (0.94 → 1, 12px → 0) — never a slide-from-edge.
- **Header:** title in display font, close button as a bare oversized "×", optional "last updated" byline.
- **Toolbar/tabs:** underline-style active tab (2px accent border-bottom), search + view-toggle controls in a shared toolbar row.
- **Expandable forms** (custom station, blacklist entry): animate via `grid-template-rows: 0fr → 1fr`, never `max-height` or `display` toggling.

### Navigation (Header)
Flat, no background — brand wordmark left, two icon-only round key-buttons right (dark-mode toggle with animated sun/moon swap, settings gear that spins 150° on open). Same raised-key shadow language as the rest of the app; the header is not a separate visual register.

## Do's and Don'ts

### Do:
- **Do** treat every new control as a real PS-101 hardware part first — ask "what would this be on the physical deck" before inventing a generic web-UI pattern.
- **Do** express active/pressed/playing state as a shadow inversion (raised → inset) plus a 1px shift, per the Push-In Rule.
- **Do** keep the display window's colors theme-invariant (One Well Rule) — it is the one surface that ignores light/dark and case-shell changes.
- **Do** pair case-shell color changes as a single unit (case gradient + accent + glow) per the Shell, Not Skin Rule — never recolor the accent alone.
- **Do** use IBM Plex Mono for anything data-like or labeled, and reserve Chakra Petch for brand/station-name display text.

### Don't:
- **Don't** introduce a flat drop-shadow-on-color-field look anywhere — every raised element needs the compound highlight+shade `--k-sh-btn` treatment, not a generic `box-shadow: 0 2px 8px rgba(0,0,0,.1)`.
- **Don't** add a new accent hue outside the six defined case-shell palettes; the whole point of the shell system is that only one saturated color is live at a time.
- **Don't** use sharp/square corners or fully flat surfaces — the three-radius system (`--k-r` / `--k-rc` / `--k-rb`) and physical shadow vocabulary are load-bearing for the "real object" illusion.
- **Don't** animate panel open/close or expandable forms with `max-height` hacks or `display: none` toggling — use `grid-template-rows: 0fr → 1fr` per the existing pattern.
