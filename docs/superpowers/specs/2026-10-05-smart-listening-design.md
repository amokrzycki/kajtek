# Smart Listening

The approved user brief governs this refactor: one local listening configuration, independent automatic station pool, deterministic protective routing, shared passive snapshots, and safe return. No proactive favorite chasing, framework, dependency, commit, or push.

## Ownership

- `listeningPreferences.ts`: validated local configuration, legacy switch/blacklist migration, artist/exact-track preferences; neutral removes an entry. Bookmarks remain separate.
- `catalog.ts`: station preferences gain `smartEnabled`; initialize from enabled state once and preserve across catalog/favorite edits.
- `nowPlaying.ts` and `stationSnapshots.ts`: normalized snapshots including upcoming evidence, bounded passive cache and shared demand monitor. Discovery and Smart demands form a union; active player metadata is reused. Cancelling demand invalidates old generations.
- `smartPolicy.ts`: pure current/upcoming eligibility, normalized reasons and candidate ranking.
- `smartRoute.ts`: explicit lifecycle, stable origin, grace, dismissal, dwell and safe-return guard; no playback imports.
- `smartListening.ts`: runtime adapter between shared snapshots, route decisions, playback operations and status UI.
- `player.ts`: active metadata and playback health; ordinary station selection cancels Smart routes. Statistics continue to consume successful `playing` events.
- Unified Smart configuration uses incumbent modal, controls, spacing and typography. Fast current-track preference opens a small artist/track form. Existing bookmarks retain their star.

## Policy

Avoid advertisements by default according to the old ad switch; news/other detectable breaks default to listen. A fresh normalized RMF non-predicted timeline break retains inferred evidence and can trigger protection, but speculative breaks never constitute proof. Trójka programmes remain legitimate content. ESKA explicit jingle becomes otherBreak; absent REST content remains unknown.

Reject fresh current avoided content or negative known music. Reliable timed upcoming evidence within 15 seconds rejects; inferred break predictions do not. Fresh known-safe candidates precede unknown/stale fallbacks. Within confidence class rank exact positive track +4, positive artist +2, favorite +0.5, similar +0.25, then catalog index and stable ID. Negative always wins. Preferences only rank destinations after a trigger.

## Lifecycle

Listening → warning (at least 5 seconds) → detour → safe return. The origin survives repeated temporary targets. No suitable destination yields a nonintrusive waiting warning and bounded retry. Manual selection, disable, and cancel-return end the route. Stay suppresses the same content window. Pause retains a detour but freezes routing and cancels an uncompleted warning. Three automatic switches per 30 seconds bound failures; return also observes minimum dwell.

A known ad end is an earliest reevaluation deadline. Return requires fresh eligible origin evidence, no impending disallowed content within 15 seconds, and at least two distinct safe observations spanning 5 seconds. Unknown/stale origin never auto-returns. Boundary jitter resets the guard.

## Persistence and evidence

Configuration migration is idempotent, imports every blacklist entry as negative exact track, and does not reinterpret bookmarks. Local storage failures retain a session fallback. Statistics v3 preserves all known durations, station rankings and operation IDs; blacklist counts become negative music avoidance; new ad/news/other counts start at zero. Successful replacement `playing` counts avoidance; automatic only counts detours. Distinct-URL recovery remains a detour without content avoidance.

## Validation

Behavior-first policy/lifecycle/migration/shared-monitor tests, full repository gates, followed by directly controlled headed Playwright flows and desktop/mobile/accessibility/reduced-motion checks. Provider timing tests remain and unsafe old blind-return assertions are replaced by safe-return requirements.
