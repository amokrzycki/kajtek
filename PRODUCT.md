# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Public listeners of Polish internet radio (RMF network, ESKA network, Radio Trojka, and custom/local stations) who want a lightweight, distraction-free web player. Not a personal-only or portfolio-only project — built for real public use.

## Product Purpose

KAJTEK Radio streams live internet radio in the browser with a full station catalog, smart playback features (ad skip, failover, blacklist), and a retro PRL cassette-player identity. Success: listeners get uninterrupted, ad-free-feeling playback of their preferred stations with minimal footprint (ultra-lightweight, zero-framework build).

## Positioning

Two inseparable pillars, both load-bearing:
- **Retro PRL aesthetic** — visual identity inspired by the Unitra PS-101 / KAJTEK cassette tape player, with cassette-reel animation and VU meter.
- **Smart playback tech** — automatic ad/commercial skip, track blacklist with auto-switch, stream failover with retry/rate-limiting.

Neither alone is the differentiator; a competitor copying only the look or only the tech misses the point.

## Operating Context

- Runs as a static web app (vanilla TypeScript, esbuild bundle, no framework/runtime dependency beyond `hls.js`).
- Station catalogs: RMF (live-fetched/cached), ESKA, Radio Trojka, curated local stations, plus user-added custom stream URLs.
- Settings, blacklist, favorites/history, sleep timer, and theme/accent preferences persisted in `localStorage`.
- Dev server (`dev.mjs`) proxies RMF API locally to bypass CORS.
- CI (Biome lint + `tsc` check) on push/PR to `main`; deploy on `v*` tags via SSH/rsync.

## Capabilities and Constraints

- Real-time audio streaming (MP3/HLS via `hls.js`), auto-failover to secondary stream mounts (3-retry / 30s rate limit).
- Ad-skip: detects ad/commercial breaks, auto-switches station until break ends (toggleable in Settings).
- Track blacklist: blocks artists/tracks, auto-switches with on-screen warning + revert.
- Album art with fallback to station logo cover during commercials/news/missing metadata.
- Dark/light theme + accent color picker, persisted.
- Favorites and history panel for stations and tracks.
- Sleep timer (15/30/60/90 min).
- VU meter + cassette reel animation using Web Audio FFT with beat-emulation fallback.
- Strict TypeScript, Biome for lint/format, esbuild for bundling — no framework.

## Brand Commitments

- Name: **KAJTEK Radio**, referencing the Unitra PS-101 / KAJTEK PRL-era cassette player.
- `styles/` (retro design system CSS) is canon — existing visual language is locked and must be preserved/documented, not replaced, by future design work.

## Product Principles

1. Nostalgia and function are one identity — the PRL cassette look and the smart playback tech must reinforce each other, not compete.
2. Stay ultra-lightweight — no framework, minimal dependencies, fast load.
3. Playback must feel uninterrupted — ad-skip, blacklist, and failover exist to protect a seamless listening experience.
4. Respect the incumbent retro visual system as design authority; extend it deliberately rather than genericizing it.
