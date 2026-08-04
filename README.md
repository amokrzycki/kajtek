# KAJTEK Radio

An ultra-lightweight retro-style web internet radio player inspired by the iconic Polish PRL cassette tape player (Unitra PS-101 / KAJTEK).

---

## Features

1. **Internet Radio Streaming** - Play live audio streams with real-time station management (RMF network, Radio Trojka, and generic MP3/HLS streams).
2. **Station Catalog** - Browse the full RMF station catalog, curated local stations, and add your own custom stream URLs. Enable/disable stations per catalog.
3. **Automatic Stream Failover** - Auto-switch to secondary MP3 stream mounts on playback error/stalled events, protected by a 3-retry / 30s rate limiter.
4. **Ad Skip** - Automatically detect ad/commercial breaks and switch to another station until the break ends (toggle in Settings).
5. **Track Blacklist** - Block artists/tracks you don't want to hear; the player automatically switches away when a blacklisted track starts, with an on-screen warning and revert option.
6. **Album Art & Station Cover Fallback** - Live track artwork display with automatic fallback to station logo cover during commercials, news breaks, or missing track metadata.
7. **Dark / Light Theme & Accent Color** - Retro-styled theme toggle and accent color picker, persisted in `localStorage`.
8. **Favorite Stations & Tracks** - Bookmark favorite stations and tracks, browsable in a dedicated history/favorites panel.
9. **Sleep Timer** - Automatically turn off audio after 15, 30, 60, or 90 minutes.
10. **VU Meter & Cassette Reels** - Smooth cassette tape reel animations and an interactive VU meter during playback (uses Web Audio FFT spectrum analysis with dynamic beat emulation fallback).

---

## Project Structure

- `src/` - Modular TypeScript application source code:
  - `app.ts` - Application entry point, event wiring, and init.
  - `consts.ts` - Default radio station presets, storage keys, timers, and constants.
  - `types.ts` - Shared TypeScript interfaces (`Station`, `TrackInfo`, `AppState`, `Provider`, ...).
  - `state.ts` - Local state store and subscription system.
  - `player.ts` - Audio playback management, track polling, metadata fetch, and stream failover.
  - `providers.ts` / `providers/` - Radio provider integrations (RMF, Trojka, Eska, generic).
  - `catalog.ts` - RMF catalog fetching/caching and known-station resolution (built-in, local, custom).
  - `localStations.ts` - Curated list of additional local stations.
  - `blacklist.ts` / `blacklistWarning.ts` - Track blacklist storage and the auto-switch warning flow.
  - `changelog.ts` - Parses `CHANGELOG.md` and detects unseen versions for the current user.
  - `controls.ts` - Volume, mute, favorites, and sleep timer control handling.
  - `visualizer.ts` - VU meter and audio visualization animation engine.
  - `ui.ts` - Primary DOM rendering engine and album art resolver.
  - `ui/` - UI subcomponents: `catalog/` (station browser & custom station form), `blacklist/` (modal & warning banner), `settings/` (settings modal), `changelog/` (changelog modal), `favorites.ts`, `history.ts`, `stations.ts`, `modal.ts`, `elements.ts`.
  - `icons.ts` - SVG icon component definitions.
  - `utils.ts` - String decoding, timing helpers, and DOM fade triggers.
  - `md.d.ts` - Type declaration enabling `.md` file imports (used for `CHANGELOG.md`).
- `CHANGELOG.md` - User-facing changelog, one `## <version>` section per release; drives the in-app changelog modal.
- `dev.mjs` - Zero-dependency dev server with esbuild watching and RMF API proxying.
- `index.html` - Core HTML5 layout and structure.
- `styles/` - Retro design system and CSS stylesheet modules.
- `public/` - Static assets (favicons, touch icons) copied verbatim into the build.
- `scripts/inject-hashes.mjs` - Injects hashed build asset filenames into `dist/index.html`.
- `dist/` - Production build directory (generated assets).
- `tsconfig.json` - Strict TypeScript configuration.
- `biome.json` - Code formatting and linting configuration.
- `.github/workflows/` - Automated GitHub Actions workflows:
  - `ci.yml` - Linting (Biome) and type checking (`tsc`) on pushes & PRs.
  - `deploy.yml` - Automated build & deployment via rsync on release tags (`v*`).

---

## Development & Building

### Installation

Install project dependencies:

```bash
npm install
```

### Local Development Server

Run local dev server with hot esbuild recompilation and built-in proxy for APIs (bypasses CORS locally):

```bash
npm run dev
```

Then open `http://localhost:3000` in your web browser.

### Production Build

Build production bundle (type check, lint, esbuild compilation of `src/app.ts` and `styles/index.css`, asset copy, and hashed-filename injection into `dist/index.html`):

```bash
npm run build
```

### Type Checking & Linting

Run TypeScript type check:

```bash
npm run check
```

Check and format code with Biome:

```bash
npm run lint
```

---

## Releasing

Add a new `## <version>` section (matching `package.json`'s `version`) to the top of `CHANGELOG.md` before tagging a release — the app reads it to show returning users what's new.

---

## CI / CD Pipelines

- **CI Workflow (`ci.yml`)**: Executes on `push` and `pull_request` to `main`. Validates code style with Biome and performs type safety checks (`npm run check`).
- **Deploy Workflow (`deploy.yml`)**: Executes on pushing version tags matching `v*`. Builds the application (`npm run build`) and deploys the contents of `dist/` to the host via SSH/rsync.
