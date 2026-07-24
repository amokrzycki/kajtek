# KAJTEK Radio

An ultra-lightweight retro-style web internet radio player inspired by the iconic Polish PRL cassette tape player (Unitra PS-101 / KAJTEK).

---

## Features

1. **Internet Radio Streaming** - Play live audio streams with real-time station management.
2. **Dark / Light Theme** - Retro-styled theme toggle persisted in `localStorage`.
3. **Favorite Stations** - Bookmark your favorite stations with ★ and keep them saved locally.
4. **Sleep Timer** - Automatically turn off audio after 15, 30, 60, or 90 minutes.
5. **VU Meter & Cassette Reels** - Smooth cassette tape reel animations and an interactive VU meter during playback.

---

## Project Structure

- `src/` - Modular TypeScript application source code:
  - `app.ts` - Application entry point.
  - `controls.ts` - Audio control event handling and keyboard shortcuts.
  - `data.ts` - Default radio station presets and data structures.
  - `icons.ts` - SVG icon component definitions.
  - `player.ts` - Audio playback management.
  - `providers.ts` - External radio provider integrations.
  - `state.ts` - Local state management and localStorage persistence.
  - `ui.ts` - DOM rendering and UI updates.
  - `visualizer.ts` - VU meter and audio visualization animation engine.
- `index.html` - Core HTML5 layout and structure.
- `style.css` - Retro design system (CSS variables, dark/light modes, animations).
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

### Build

Build production bundle (esbuild compilation of `src/app.ts` into `dist/app.js` and static assets copy):

```bash
npm run build
```

### Type Checking & Linting

Run TypeScript type check:

```bash
npx tsc --noEmit
```

Check and format code with Biome:

```bash
npx @biomejs/biome check ./
```

---

## CI / CD Pipelines

- **CI Workflow (`ci.yml`)**: Executes on `push` and `pull_request` to `main`. Validates code style with Biome (`npx @biomejs/biome ci ./`) and performs type safety checks (`npx tsc --noEmit`).
- **Deploy Workflow (`deploy.yml`)**: Executes on pushing version tags matching `v*`. Builds the application (`npm run build`) and deploys the contents of `dist/` to the host via SSH/rsync.

---

## Getting Started

To serve the project locally, build the distribution files and run a local HTTP server pointing to `dist/`:

```bash
npm run build
python3 -m http.server 8080 --directory dist
```

Then open `http://localhost:8080` in your web browser.
