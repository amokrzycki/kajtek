# KAJTEK Radio

An ultra-lightweight retro-style web internet radio player inspired by the iconic Polish PRL cassette tape player (Unitra PS-101 / KAJTEK).

---

## Features

1. **Internet Radio Streaming** - Play live audio streams with real-time station management.
2. **Automatic Stream Failover** - Auto-switch to secondary MP3 stream mounts on playback error/stalled events, protected by a 3-retry / 30s rate limiter.
3. **Album Art & Station Cover Fallback** - Live track artwork display with automatic fallback to station logo cover during commercials, news breaks, or missing track metadata.
4. **Dark / Light Theme** - Retro-styled theme toggle persisted in `localStorage`.
5. **Favorite Stations** - Bookmark your favorite stations with ★ and keep them saved locally.
6. **Sleep Timer** - Automatically turn off audio after 15, 30, 60, or 90 minutes.
7. **VU Meter & Cassette Reels** - Smooth cassette tape reel animations and an interactive VU meter during playback (uses Web Audio FFT spectrum analysis with dynamic beat emulation fallback).

---

## Project Structure

- `src/` - Modular TypeScript application source code:
  - `app.ts` - Application entry point and event initialization.
  - `consts.ts` - Default radio station presets (`apiBaseUrl`), storage keys, and constants.
  - `controls.ts` - Audio control event handling, volume, and sleep timers.
  - `icons.ts` - SVG icon component definitions.
  - `player.ts` - Audio playback management, track polling, metadata fetch, and stream failover.
  - `providers.ts` - Radio provider integrations (RMF Network, Eska, Generic).
  - `state.ts` - Local state management and subscription system.
  - `types.ts` - Shared TypeScript interfaces (`Station`, `TrackInfo`, `AppState`, `Provider`).
  - `ui.ts` - Primary DOM rendering engine and album art resolver.
  - `ui/` - Subcomponents for UI elements, track history panel, and station list rendering.
  - `utils.ts` - String decoding, timing helpers, and DOM fade triggers.
  - `visualizer.ts` - VU meter and audio visualization animation engine.
- `dev.mjs` - Zero-dependency dev server with esbuild watching and RMF API proxying.
- `index.html` - Core HTML5 layout and structure.
- `styles/` - Retro design system and CSS stylesheet modules.
- `dist/` - Production build directory (generated assets).
- `tsconfig.json` - Strict TypeScript configuration.
- `biome.json` - Code formatting and linting configuration.
- `.github/workflows/` - Automated GitHub Actions workflows:
  - `ci.yml` - Linting (Biome) and type checking (`tsc`) on pushes & PRs.
  - `deploy.yml` - Automated build & deployment via rsync on release tags (`v*`).

---

## Development & Building

### Local Development Server

Run local dev server with hot esbuild recompilation and built-in proxy for APIs (bypasses CORS locally):

```bash
npm run dev
```

Then open `http://localhost:3000` in your web browser.

### Installation

Install project dependencies:

```bash
npm install
```

### Production Build

Build production bundle (esbuild compilation of `src/app.ts` into `dist/app.js` and static assets copy):

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
npx @biomejs/biome check ./
```

---

## CI / CD Pipelines

- **CI Workflow (`ci.yml`)**: Executes on `push` and `pull_request` to `main`. Validates code style with Biome (`npx @biomejs/biome ci ./`) and performs type safety checks (`npm run check`).
- **Deploy Workflow (`deploy.yml`)**: Executes on pushing version tags matching `v*`. Builds the application (`npm run build`) and deploys the contents of `dist/` to the host via SSH/rsync.
