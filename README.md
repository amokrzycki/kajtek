# KAJTEK Radio

An ultra-lightweight retro-style web internet radio player inspired by the iconic Polish PRL cassette tape player (Unitra PS-101 / KAJTEK).

---

## Features

1. **Internet Radio Streaming** - Play live audio streams with real-time station management (RMF network, ESKA network, Radio Trojka, and generic MP3/HLS streams).
2. **Station Catalog** - Browse the full RMF and ESKA station catalogs, curated local stations, and add your own custom stream URLs. Enable/disable stations per catalog.
3. **Automatic Stream Failover** - Auto-switch to secondary MP3 stream mounts on playback error/stalled events, protected by a 3-retry / 30s rate limiter.
4. **Smart Listening** - One master switch, content policy and independent station pool: temporarily route away from unwanted content, then return when fresh metadata confirms the original station is suitable. Configure it from Settings or use the SMART switch on the deck.
5. **Explicit Music Preferences** - Prefer, avoid or stay neutral about an exact artist or artist/title pair. Negative preferences trigger protection; positive preferences rank destinations only when a detour is needed. Track bookmarks remain separate.
6. **Album Art & Station Cover Fallback** - Live track artwork display with automatic fallback to station logo cover during commercials, news breaks, or missing track metadata.
7. **Dark / Light Theme & Accent Color** - Follows the OS theme until a manual choice is saved in `localStorage`; Settings can restore system mode. Six case shell colors.
8. **Favorite Stations & Tracks** - Bookmark favorite stations and tracks, browsable in a dedicated history/favorites panel.
9. **Sleep Timer** - Automatically turn off audio after 15, 30, 60, or 90 minutes.
10. **Personal Listening Recap** - A local weekly/all-time recap of measured advertising/playlist-break time, separate content-avoidance counts, successful automatic detours, actual listening time, and the five most-listened stations. Opens from the header utility controls.
11. **Co teraz gra?** - Browse current songs and programmes across enabled stations, with artwork and a shared list/grid preference, then tune by content through the existing player. Badges show explicit preferred artists/tracks and unwanted music, independently of bookmarked tracks.
12. **VU Meter & Cassette Reels** - Smooth cassette tape reel animations and an interactive VU meter during playback (uses Web Audio FFT spectrum analysis with dynamic beat emulation fallback).

---

## Project Structure

- `src/` - Modular TypeScript application source code:
  - `app.ts` - Application entry point, event wiring, and init.
  - `consts.ts` - Default radio station presets, storage keys, timers, and constants.
  - `types.ts` - Shared TypeScript interfaces (`Station`, `TrackInfo`, `AppState`, `Provider`, ...).
  - `state.ts` - Local state store and subscription system.
  - `statistics.ts` - Versioned recap aggregation, local-week boundaries, idempotent route events, and playback accounting.
  - `statisticsPlayback.ts` - Audio-event instrumentation, serialized local persistence, and recap subscriptions.
  - `player.ts` - Audio playback management, track polling, metadata fetch, and stream failover.
  - `metadata.ts` - Shared metadata transport and provider parsing, with cancellable passive requests independent of playback health.
  - `nowPlaying.ts` - Normalized current/upcoming content snapshots, evidence, explicit preference flags, bounded refresh cache and ordering.
  - `stationSnapshots.ts` - Shared passive monitor: combines discovery and Smart Listening demand, reuses active-player metadata, and cancels obsolete refreshes.
  - `listeningPreferences.ts` - Validated local Smart Listening configuration, artist/track preferences, and legacy migration.
  - `smartPolicy.ts` - Pure content eligibility, reliable upcoming evidence and deterministic destination scoring.
  - `smartRoute.ts` - Protective lifecycle, stable origin, warning grace, dismissal, switch limits and safe-return guard.
  - `smartListening.ts` - Runtime adapter connecting snapshots and route decisions to playback and statistics.
  - `providers.ts` / `providers/` - Radio provider integrations (RMF, Trojka, Eska, generic).
  - `catalog.ts` - RMF catalog fetching/caching, known-station resolution (built-in, local, custom), and independent `smartEnabled` station preferences.
  - `localStations.ts` - Curated list of additional local stations.
  - `changelog.ts` - Parses `CHANGELOG.md` and detects unseen versions for the current user.
  - `controls.ts` - Volume, mute, favorites, and sleep timer control handling.
  - `visualizer.ts` - VU meter and audio visualization animation engine.
  - `ui.ts` - Primary DOM rendering engine and album art resolver.
  - `ui/` - UI subcomponents: `catalog/` (station browser & custom station form), `smartListening/modal.ts` (one configuration and current-track preference form), `smartListening/warning.ts` (protective-route status and actions), `settings/` (settings modal), `changelog/` (changelog modal), `shortcuts/` (keyboard shortcuts cheatsheet), `favorites.ts`, `history.ts`, `statistics.ts` (personal listening recap modal), `stations.ts`, `stationBrowser.ts` (browser mode and shared snapshot demand), `browserTransition.ts` (interruptible panel handoff), `nowPlaying.ts` (content entries), `modal.ts`, `elements.ts`.
  - `icons.ts` - SVG icon component definitions.
  - `utils.ts` - String decoding, timing helpers, and DOM fade triggers.
  - `md.d.ts` - Type declaration enabling `.md` file imports (used for `CHANGELOG.md`).
- `CHANGELOG.md` - User-facing changelog, one `## <version>` section per release; drives the in-app changelog modal.
- `dev.mjs` - Zero-dependency dev server with esbuild watching and RMF API proxying.
- `server-utils.mjs` - Shared static-route resolution and privacy-safe upstream proxy headers.
- `index.html` - Core HTML5 layout and structure.
- `styles/` - Retro design system and CSS stylesheet modules, including `stations/now-playing.css` for discovery entries, `statistics.css` for the personal recap and the legal-document layout, `modals/smart-listening.css` for Smart Listening configuration, and `history/smart-warning.css` for the incumbent protective status banner.
- `public/` - Static assets and `/privacy` and `/legal` pages copied verbatim into the build; `appearance.js` restores their saved theme and case shell before rendering.
- `tests/` - Vitest coverage and captured provider fixtures.
- `scripts/smart-listening-qa.mjs` - Direct headed Playwright routing and UX checks; setup and evidence in `docs/smart-listening-verification.md`.
- `scripts/inject-hashes.mjs` - Injects hashed build asset filenames into `dist/index.html`.
- `dist/` - Production build directory (generated assets).
- `tsconfig.json` - Strict TypeScript configuration.
- `tsconfig.test.json` - TypeScript configuration for source and test files.
- `biome.json` - Code formatting and linting configuration.
- `.github/workflows/` - Automated GitHub Actions workflows:
  - `ci.yml` - Linting, source/test type checking, and Vitest on pushes & PRs.
  - `deploy.yml` - Automated build & deployment via rsync on release tags (`v*`).

---

## How Smart Listening chooses

Smart Listening has one configuration entry in Settings and one master switch. Its station pool is initialized once from catalog visibility, then stored independently as `smartEnabled` in station preferences. Changing catalog visibility or favorites does not change routing permission. The content policy can avoid advertisements, news or other detectable breaks; advertisements inherit the old ad-skip choice, while news and other breaks initially remain allowed. Programmes are legitimate content and missing metadata is unknown.

Music preferences explicitly target an artist or exact artist/title pair. **Prefer** ranks a possible destination, **Avoid** rejects known music and **Neutral** removes the preference. Any negative match takes precedence over a positive one. Saved stars are bookmarks, not listening preferences; old blacklist entries migrate to negative exact-track preferences without reinterpreting bookmarks. If the old blacklist was disabled but contained entries, migration starts the unified master off so those music rules do not silently become active; the advertisement policy still preserves the old ad-skip choice.

Protection starts only when fresh current metadata or reliable timed upcoming metadata within 15 seconds violates the policy. Kajtek gives at least five seconds to react and evaluates the whole permitted pool. Known suitable content precedes unknown/stale fallbacks. Within a confidence class, preferred exact tracks (+4), preferred artists (+2), favorite stations (+0.5) and similar stations (+0.25) rank destinations, followed by stable catalog order and station ID. A liked song on another station never causes an unsolicited switch.

The original station survives further temporary detours. A reported break end is the earliest time to reevaluate a return, not proof that the origin is suitable. Automatic return requires fresh suitable metadata, no reliable impending unwanted content, and two distinct safe observations spanning at least five seconds, together with minimum dwell. Unknown or stale origin data cannot authorize return; there is no blind three-minute fallback. If no destination is suitable, Kajtek shows a waiting status and retries within the normal polling bounds. Manual station selection, disabling Smart Listening or choosing **Zostań tutaj** ends the route; **Zostań mimo to** suppresses that content window. Pause cancels an unfinished warning and freezes routing while preserving an existing detour. Automatic switches are bounded to three per 30 seconds.

Discovery and Smart Listening share one passive snapshot monitor and bounded cache (15-second TTL, at most four concurrent metadata requests). Their station demands form a union; active-player metadata is reused, and obsolete requests are cancelled without affecting playback health. Snapshots and artwork failures stay in memory. RMF non-predicted playlist gaps retain inferred evidence; speculative gaps cannot trigger protection. Explicit ESKA ads, news and jingles are distinguishable; absent REST content stays unknown. Trójka programmes remain programmes.

`kajtek_smart_listening` stores the master state, content policy and explicit preferences locally. Legacy ad-skip/blacklist keys are migration inputs, not parallel live settings. Storage failure leaves a usable session configuration. Preferences and route state are not uploaded or used to build a listening history.

---

## How the listening recap counts

Tracking starts when this feature is first loaded; existing favorites, playlists and settings cannot establish past listening or protection. The recap offers **this week** and **since tracking began**, without a session view. A week runs Monday–Sunday in the device's local time, including daylight-saving transitions.

- **Measured advertising/playlist-break time:** actual audible replacement audio overlapping a known, bounded advertising interval. ESKA's explicit HLS `REKLAMA` tag reports elapsed/total milliseconds; RMF playlist breaks can supply scheduled start/end timestamps. RMF gaps remain inferred playlist breaks, not confirmed advertisements. Loading, grace, mute, pause, buffering and time outside the interval earn no saved time. News, other breaks, negative music, predictions and unknown-length breaks never receive guessed minutes. Pause retains the relationship with an unexpired window while resetting the media/wall baseline; manual selection, route cancellation or return ends it. The same timing may defer return evaluation, but cannot authorize return without fresh safe evidence.
- **Content avoided:** separate counts for advertisements, news, other detectable breaks and negative music (artist or exact track). One completed protective switch, confirmed by replacement audio's `playing` event, counts one omission. **Przełącz teraz** counts too. Mid-fragment detection avoids only the remainder; these are action counts, not unique songs or complete broadcasts. Warnings, checks, dismissals, failed playback and rate-limited attempts do not count.
- **Automatic detours:** one completed automatic protective switch or successful failover to a **different stream URL**. Excludes manual switches (including **Przełącz teraz**), returns, same-URL retries and internal HLS recovery. An automatic avoidance can contribute to both its reason counter and detours; those counts must not be added together. Recovery contributes only a detour, never a content omission.
- **Listening:** advancement of `HTMLAudioElement.currentTime`, bounded by elapsed time and adjusted for playback rate, while unmuted with nonzero volume. Pause, waiting/stalled playback, failed requests, seeks, timeline jumps and open-app time are excluded. Playback baselines and pending operations remain in memory.

Discovery refreshes reconcile artwork, text, badges and observation time separately, preserving unchanged nodes and keyboard focus. Failed artwork URLs are remembered only in memory for this page session; new URLs are attempted normally and a reload resets that memory. Leaving discovery releases its passive demand while an active Smart Listening route can retain its own demand.

`kajtek_statistics` holds a versioned aggregate: tracking start, all-time totals, the current local-week totals, and the last 128 opaque completed-operation IDs. Pending operations are consumed before recording, so repeated `playing` events cannot double-count; persisted IDs also make repeated commits idempotent. Duration spans are split at week boundaries. Schema version 3 stores cumulative and current-week station durations with the existing stable `Station.id` and a display-name snapshot, so unavailable stations remain readable and stream failover cannot fragment their totals. Global and station durations share one validated media-advancement interval and the same local-week split; switches flush the previous station before assigning the next. Rankings omit zero time, show at most five stations, and break ties by stable ID. No track names, station URLs or event history are stored. Versions 1 and 2 migrate deterministically, preserving tracking start, week boundary, known durations and recent operation IDs. Legacy `blacklistAvoided` becomes `negativeMusicAvoided`; new `adsAvoided`, `newsAvoided` and `otherBreaksAvoided` counters start at zero rather than being reconstructed from detours. Version 2 station aggregates are preserved; version 1 has no historical station attribution and starts those aggregates empty. Existing favorites and preferences cannot establish earlier listening.

Media advancement is checkpointed every five seconds and on playback/volume/visibility changes. Writes merge the latest aggregate and use Web Locks when available to serialize multiple tabs; browsers without Web Locks provide best-effort merging. A sudden browser/process termination can lose the last uncommitted interval. Normal reloads retain committed totals. Storage failure keeps the current run in memory and the recap says that it cannot be saved. Clearing site data clears the recap.

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

Open `http://localhost:3000` locally. The server also prints network addresses for testing on phones connected to the
same network. Set `KAJTEK_PORT` when port 3000 is busy.

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

- **CI Workflow (`ci.yml`)**: Executes on `push` and `pull_request` to `main`. Runs Biome, source/test type checks, and Vitest.
- **Deploy Workflow (`deploy.yml`)**: Executes on pushing version tags matching `v*`. Builds the application (`npm run build`) and deploys the contents of `dist/` to the host via SSH/rsync.
