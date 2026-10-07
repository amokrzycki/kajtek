# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Public listeners of Polish internet radio (RMF network, ESKA network, Radio Trojka, and custom/local stations) who want a lightweight, distraction-free web player. Not a personal-only or portfolio-only project — built for real public use.

## Product Purpose

KAJTEK Radio streams live internet radio in the browser with a full station catalog, Smart Listening protective routing and stream failover, and a retro PRL cassette-player identity. Success: listeners get continuous playback that respects their content preferences of their preferred stations with minimal footprint (ultra-lightweight, zero-framework build).

## Positioning

Two inseparable pillars, both load-bearing:
- **Retro PRL aesthetic** — visual identity inspired by the Unitra PS-101 / KAJTEK cassette tape player, with cassette-reel animation and VU meter.
- **Smart playback tech** — one Smart Listening configuration for content policy, independent routing pool and explicit artist/track preferences, with evidence-based return and separate stream failover.

Neither alone is the differentiator; a competitor copying only the look or only the tech misses the point.

## Operating Context

- Runs as a static web app (vanilla TypeScript, esbuild bundle, no framework/runtime dependency beyond `hls.js`).
- Station catalogs: RMF (live-fetched/cached), ESKA, Radio Trojka, curated local stations, plus user-added custom stream URLs.
- Smart Listening configuration, station permissions, bookmarks, and theme/accent preferences persisted in `localStorage`.
- Dev server (`dev.mjs`) proxies RMF API locally to bypass CORS.
- CI (Biome lint + `tsc` check) on push/PR to `main`; deploy on `v*` tags via SSH/rsync.

## Capabilities and Constraints

- Real-time audio streaming (MP3/HLS via `hls.js`), auto-failover to secondary stream mounts (3-retry / 30s rate limit).
- Smart Listening: one master state, one Settings entry, an independent station pool and content policies for advertisements, news and other detectable breaks. Catalog visibility and station favorites do not grant routing permission after the initial migration.
- Explicit artist or exact artist/title preferences: prefer, neutral or avoid. Negative takes precedence; neutral removes the preference. Positive preferences rank destinations after a protection trigger and never cause proactive favorite chasing. Saved-track stars remain separate bookmarks. Migration retains negative entries from a disabled old blacklist but starts the unified master off until the listener chooses to enable it; the old advertisement policy remains saved.
- Protective routing: fresh evidence triggers a warning with at least five seconds to react, a scored temporary destination and continuous origin reevaluation. Unknown/stale origin data cannot authorize automatic return; a reported ad end only starts reevaluation. Two distinct suitable observations over at least five seconds, no imminent unwanted content and minimum dwell are required.
- Manual station selection, master disable or cancel-return ends a detour. Pause freezes routing; if no destination is suitable, show a waiting status and retry within bounded polling. Keep the original station stable through successive temporary destinations.
- Album art with fallback to station logo cover during commercials/news/missing metadata.
- Dark/light theme + accent color picker, persisted.
- Favorites and history panel for stations and tracks.
- “Co teraz gra?” discovery beside STACJE: current content across enabled stations, with explicit preferred artist/track and negative-music markers. Discovery and Smart Listening share passive snapshots and reuse active metadata; passive requests never alter playback health; ESKA REST absence remains unknown, RMF gaps retain inferred evidence, predictions do not establish a trigger, and Trójka programme fallback stays programme content.
- Preferences remain local; passive snapshots and routing state stay in memory. Storage failure retains usable session settings. Statistics v3 preserves prior measured totals and counts successful content omissions separately from known advertising/playlist-break time and automatic detours; no history is reconstructed from bookmarks or settings.
- Sleep timer (15/30/60/90 min).
- VU meter + cassette reel animation using Web Audio FFT with beat-emulation fallback.
- Strict TypeScript, Biome for lint/format, esbuild for bundling — no framework.

## Brand Commitments

- Name: **KAJTEK Radio**, referencing the Unitra PS-101 / KAJTEK PRL-era cassette player.
- `styles/` (retro design system CSS) is canon — existing visual language is locked and must be preserved/documented, not replaced, by future design work.
- **One Well amendment (owner-approved, recorded 2026-09-30):** the display window is dark glass in every light/dark theme, and the case shell may tint it — only via the six `[data-case]` glass overrides in `themes.css`, within the limits of DESIGN.md's One Well Rule. This is the one sanctioned exception to "the well ignores its surroundings"; no other surface may follow the shell tint this way.

## Product Principles

1. Nostalgia and function are one identity — the PRL cassette look and the smart playback tech must reinforce each other, not compete.
2. Stay ultra-lightweight — no framework, minimal dependencies, fast load.
3. Playback must feel uninterrupted — Smart Listening and failover protect continuous listening without inventing evidence or pursuing preferences proactively.
4. Respect the incumbent retro visual system as design authority; extend it deliberately rather than genericizing it.
