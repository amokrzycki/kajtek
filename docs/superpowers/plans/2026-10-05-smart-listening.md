# Smart Listening Implementation Plan

> For agentic workers: use executing-plans for coupled core work and focused independent agents for metadata, statistics and UI. Do not commit.

**Goal:** Generalize protective routing into one inspectable Smart Listening system.
**Architecture:** Single persisted config; one shared cache; pure policy and lifecycle; thin runtime/player adapter; unified incumbent UI.
**Tech Stack:** Existing vanilla strict TypeScript, DOM, Vitest, Biome, esbuild.
**Spec:** ../specs/2026-10-05-smart-listening-design.md plus the approved uploaded brief.

## Constraints

No commits/pushes, runtime dependencies, proactive favorites, duplicated polls, generic rules framework, or visual redesign. All independent workers own disjoint files and publish their interfaces before integration.

- [x] Configuration: write RED migration/preference/pool tests; implement validated config store and independent smartEnabled fields; GREEN.
- [x] Policy/lifecycle: write RED current/upcoming ranking, no proactive switch, stable origin, dismissal and safe-return tests; implement pure policy and route modules; GREEN.
- [x] Shared metadata: RED shared demand/cancellation/upcoming tests; retain existing cache concurrency/TTL; introduce one demand monitor, provider uncertainty fixes; GREEN.
- [x] Runtime: replace legacy warning/detection, connect player metadata and successful audio routes, freeze on pause and cancel on manual selection/disable; integration tests.
- [x] Statistics: RED v3 migration/counters/playing tests; preserve timings, station rankings and recovery semantics; update honest recap; GREEN.
- [x] UX: one Settings entry and master, one progressively disclosed configuration, scope/value preferences, repurpose deck switch, update badges/history; preserve focus and tokens.
- [x] Documentation and completion: migrate privacy/product/structure/changelog; review diff; harden/polish in bounded desktop/mobile rounds; full gates and headed Playwright controlled routing scenarios.

Ruling: user explicitly approved direction and requested autonomous implementation; skill reconfirmation/commit gates do not apply. Work uses the provided clean cloud checkout without creating an unrelated worktree.
