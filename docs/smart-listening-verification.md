# Smart Listening implementation and verification

Verified on 2026-10-06 against HEAD `e0db4d5a4522a71f075e51a771e1a29648f5336f`. All work remains uncommitted; no push, PR, deployment or runtime dependency was added. CodeGraph was unavailable, so ownership was established by read-only call-path inspection.

## 1. Architecture and ownership

| Module | Responsibility |
| --- | --- |
| `src/listeningPreferences.ts` | Validated version-1 configuration, local persistence/session fallback, legacy migration and explicit artist/exact-track preferences. |
| `src/catalog.ts` | Independent `StationPref.smartEnabled`; batched pool initialization and catalog visibility. |
| `src/nowPlaying.ts` | Normalized current/upcoming snapshots, cache, concurrency, TTL/stale semantics and cancellation generations. |
| `src/stationSnapshots.ts` | One demand-driven monitor shared by discovery and Smart Listening; union of their station demands and active-player reuse. |
| `src/smartPolicy.ts` | Pure eligibility, normalized triggers, confidence and deterministic ranking. |
| `src/smartRoute.ts` | Pure lifecycle, stable origin, warning, rerouting, suppression, safe return and switch cap. |
| `src/smartListening.ts` | Runtime subscriptions, complete-pool evaluation, playback commands and statistics context. |
| `src/player.ts` | Actual playback, metadata publication, manual/internal switch distinction and audio statistics integration. |
| `src/statistics.ts` | Version-3 migration, successful avoidance counters and measured listening/ad interval unions. |
| `src/ui/smartListening/` | Unified progressive configuration and status banner. |

Discovery releases demand when closed or hidden. Smart Listening retains its pool plus origin/current while enabled and audio is active, including a hidden page. When both consumers withdraw, timers/in-flight work stop; fresh successful cache entries remain reusable. Passive requests never change playback failure health. Concurrency stays at four; TTL is 15 seconds, stale boundary 30 seconds and cache maximum age 120 seconds. Late responses cannot restore obsolete entries.

## 2. Migration semantics

- Every valid old blacklist row becomes a negative exact artist/title preference. Versioned migration is idempotent. Legacy keys are migration inputs only; the old engines are removed.
- Advertisement avoidance inherits the old ad-skip choice; news and other breaks initially remain allowed. The master normally inherits either enabled legacy protection. If an explicitly disabled blacklist contains entries, the unified master starts off to avoid silently activating those entries; the old advertisement policy remains saved.
- Historical stars remain bookmarks. No positive preferences are invented from them. Neutral deletes the stored preference.
- Existing explicit station visibility initializes `smartEnabled`; initial/custom enabled defaults are captured for newly known stations. Explicit Smart permission survives ordinary visibility and favorite changes. Initialization writes the full pool once.
- Statistics v1/v2 preserve tracking start, week boundaries, durations, operation IDs, detours and known station rankings. `blacklistAvoided` becomes `negativeMusicAvoided`. New advertisement/news/other-break counts start at zero. V1 has no historical station attribution to recover.
- The old auto-return switch is retired. Returns now belong to the unified safe-return lifecycle; its old key no longer controls a separate engine.
- Storage read/write denial or quota rejection retains usable session choices. Malformed preference rows are ignored safely.

## 3. Exact policy

A snapshot is usable for protection when it has a successful non-stale observation less than 30 seconds old. Known current avoided advertisement/news/otherBreak or negative exact/artist music rejects it. Any negative match takes precedence over positive music. Programmes remain permissible; predicted/unknown content supplies no hard proof.

Within an inclusive 15-second upcoming horizon, published timed music and explicitly detected timed break content can reject a candidate. Predicted items, inferred upcoming gaps and untimed REST queue order cannot.

Known-safe candidates precede unknown/stale/error fallbacks. For known-safe candidates, bonuses add: exact track **4**, artist **2**, favorite station **0.5**, similar station **0.25**. Ties follow pool/catalog order then stable ID, never response completion order. Fallback candidates have score zero. Unknown is usable only as a destination fallback; it never proves safe return. There is no switching without a current/upcoming avoidance trigger, regardless of positive content elsewhere.

## 4. Routing lifecycle

Listening arms a five-second visible warning after a reliable trigger. The runtime waits for the complete shared pool before choosing, including a pending manual switch-now. Switch-now bypasses grace and is marked manual. No candidate yields an unavailable status and bounded normal reevaluation, not a sequence of failed switches.

The origin is fixed throughout all detours. A newly bad temporary station can arm a new warning and choose another destination while retaining that origin. Ordinary manual selection or master disable clears the relationship. Pause cancels an unfinished warning but preserves a detour and resets return proof. Stay-anyway suppresses the same content/window across metadata boundary jitter; a genuinely different trigger can still protect. Manual return suppresses immediate re-triggering on that original content. Stay-here cancels return and ends its saved-time context.

Automatic outward switches and returns share the cap of three switches in 30 seconds. Manual actions bypass that cap. Positive scores are never compared to chase content during safe listening or a safe detour.

## 5. Safe return

A known RMF/ESKA ad deadline is an earliest reevaluation boundary, never an unconditional return command. The origin must have fresh known-safe current content, no reliably upcoming disallowed content, and two distinct source observations spanning at least five seconds. Return also requires at least ten seconds on the latest temporary station and room within the automatic switch cap. Unsafe, stale, unavailable or jittering evidence resets the safe guard. Avoided news or negative music after an advertisement blocks return; allowed news does not. There is no blind three-minute fallback.

## 6. UX

Settings exposes one master and one configuration link. The physical deck control is SMART with switch name/state. One modal discloses station pool, content rules and music preferences, with search and explicit artist/track plus Prefer/Neutral/Avoid values. Current/history music actions prefill this form; bookmarks stay separate. Discovery badges reflect explicit music preferences.

The status banner stays visible independently of playlist expansion. It explains trigger, destination, useful preference reason and safe-return state; internal numeric scores stay hidden. It supplies switch-now, stay-anyway, manual return and stay-here actions. Focus survives countdown updates and warning-to-detour transitions, moves safely when controls disappear, and returns to the originating trigger on modal dismissal. Modal focus waits for visibility and excludes controls inside collapsed details; current-track entry focuses the value field. Native controls expose accessible names/state and retain visible focus. Responsive wrapping, long names and reduced motion preserve the KAJTEK materials/type/control language.

## 7. Automated verification

| Command | Final result |
| --- | --- |
| `npm run check` | PASS |
| `npm run test:types` | PASS |
| `npm test` | PASS — 302 tests, 21 files |
| `npm run lint` | PASS — 124 files checked |
| `npm run build` | PASS — production JS/CSS/assets and hash injection |
| `git diff --check` | PASS |

The final lint attempt initially caught a missing terminal newline in the saved QA JSON artifact. It was corrected; lint and the full production build then passed. No outstanding test, type, lint or build failure remains. The final scoped correctness and focus reviews found no actionable remaining issue.

Behavioral coverage includes all 28 requested cases, with policy/lifecycle tests plus a smaller player/runtime/UI integration set. Regression tests also cover disabled legacy music rules, complete-pool manual intent, readable quota-failed storage, distinct return observations, canonical RMF end timestamps, original-ad statistics continuity through reroutes, new/overlapping ad intervals, large-pool write bounds and malformed persistence. Existing provider, playback timing, discovery and privacy cases remain in the suite.

## 8. Headed browser proof

All 14 recorded scenarios pass in direct headed Chromium. No unexpected page or console errors. The provider-outage case produced 11 intentional HTTP 503 console messages.

| Scenario | Result |
| --- | --- |
| RMF ad -> reject ESKA artist -> Classic liked -> news holds -> safe return | PASS |
| negative track -> Classic becomes bad -> MAXX -> original RMF return | PASS |
| liked artist elsewhere without trigger never switches | PASS |
| keyboard settings/config/Escape restores original focus | PASS |
| mobile/long names/200% zoom/reduced motion | PASS |
| disabled Smart does not protectively switch or poll pool | PASS |
| empty pool explains unavailable destination without switching | PASS |
| pause/resume retains detour and requires safe return | PASS |
| ordinary station selection cancels original return relationship | PASS |
| origin provider outage/stale evidence holds detour | PASS |
| 1000 custom stations/search/long station names | PASS |
| discovery reuses Smart snapshots and hidden-page playback keeps polling | PASS |
| disable during detour keeps current audio and cancels return | PASS |
| empty preferences explain how to add a rule | PASS |

Accessible dialog/switch names, checked state, keyboard activation, Tab/Shift+Tab trapping and visible focus were asserted. Desktop was 1280×1000, mobile 390×844, and desktop zoom 200%. Current-track prefill/value focus, long artist text and preserved countdown/action focus were checked. The 1000-station modal open/search took 1387 ms in this run. Pure catalog lookup for 1000 stations improved from about 1002 ms first / 497 ms repeat to 3.47 ms first / 4.43 ms repeat on the same in-memory storage benchmark (four total storage reads, one initialization write, then zero writes).

Saved evidence: [results](smart-listening-qa/results.json), [detour](smart-listening-qa/detour-desktop.png), [configuration](smart-listening-qa/config-desktop.png), [mobile](smart-listening-qa/preferences-mobile.png), [200% zoom](smart-listening-qa/preferences-zoom.png).

The runner is `scripts/smart-listening-qa.mjs`. It uses Playwright directly with `headless: false` and a real Chromium/X display, controlled raw RMF/ESKA responses, and real HTMLAudioElement playback of a synthesized WAV stream. It never stubs `play()` or fabricates successful-playing counters. Routing uses a controlled clock; keyboard/layout checks use the normal browser clock so CSS transitions settle naturally. Expected HTTP 503s are isolated from unexpected console/page errors. Decorative remote artwork/fonts are mocked; source screenshots reflect the incumbent layout with fallback fonts/art placeholders.

To repeat, start `npm run dev` on port 3000, supply a running X display and a Chromium executable, then run:

```bash
DISPLAY=:99 KAJTEK_CHROMIUM=/usr/bin/chromium \
  KAJTEK_PLAYWRIGHT_MODULE=/tmp/kajtek-browser-qa/node_modules/playwright/index.mjs \
  node scripts/smart-listening-qa.mjs
```

Install Playwright separately if absent; it is an optional manual QA tool, not a repository/runtime dependency. The runner defaults output to `/tmp/kajtek-browser-qa`; `KAJTEK_QA_OUTPUT` can select another output directory. A normal Playwright package import is used when the module override is omitted. A headed display is required; the runner does not fall back to headless.

## 9. Deliberate limits and provider confidence

- RMF bounded non-predicted timeline gaps remain inferred ad/news evidence. This retains useful incumbent protection while speculative expired-song gaps remain unknown. Inferred future breaks never hard-reject.
- Passive ESKA has REST metadata but no candidate HLS/ZPR session. Missing REST content and untimed futures cannot prove a break/end time. Explicit active jingles map to otherBreak; programme content stays legitimate.
- Trójka preserves underlying cached source observation times; fetching a cached response does not manufacture freshness. Untimed/generic metadata cannot provide safe-return proof.
- Unknown destination fallback is intentionally lower confidence. It does not promise acceptable content or permit an automatic return.
- Ad saved time measures audible media advancement inside validated reliable intervals, including interval unions without overlap credit. Unknown durations, buffering, silence/mute and warning-only/failed switches do not earn guessed savings. Clock-accelerated browser runs prove routing/count semantics; unit tests prove duration math.
- Browser checks validate accessible DOM names, native keyboard behavior and focus, not a separate assistive-technology session. Visibility continuation is exercised by the actual event listeners with controlled hidden state.
- The Smart modal fits the extra 195-CSS-pixel stress case. The pre-existing deck/page can overflow at that width (390px plus 200% zoom); standard mobile and desktop 200% zoom pass. This change preserves the existing deck layout.

## 10. Complete changed-file manifest

### Added

- `docs/smart-listening-qa/config-desktop.png`
- `docs/smart-listening-qa/detour-desktop.png`
- `docs/smart-listening-qa/preferences-mobile.png`
- `docs/smart-listening-qa/preferences-zoom.png`
- `docs/smart-listening-qa/results.json`
- `docs/smart-listening-verification.md`
- `docs/superpowers/plans/2026-10-05-smart-listening.md`
- `docs/superpowers/specs/2026-10-05-smart-listening-design.md`
- `scripts/smart-listening-qa.mjs`
- `src/listeningPreferences.ts`
- `src/smartListening.ts`
- `src/smartPolicy.ts`
- `src/smartRoute.ts`
- `src/stationSnapshots.ts`
- `src/ui/smartListening/modal.ts`
- `src/ui/smartListening/warning.ts`
- `styles/history/smart-warning.css`
- `styles/modals/smart-listening.css`
- `tests/listeningPreferences.test.ts`
- `tests/smartListening.test.ts`
- `tests/smartListeningUI.test.ts`
- `tests/smartPolicy.test.ts`
- `tests/smartRoute.test.ts`
- `tests/stationSnapshots.test.ts`
- `tests/storageFallback.test.ts`

### Modified

- `CHANGELOG.md`
- `DESIGN.md`
- `PRODUCT.md`
- `README.md`
- `index.html`
- `public/privacy/index.html`
- `src/app.ts`
- `src/catalog.ts`
- `src/changelog.ts`
- `src/controls.ts`
- `src/nowPlaying.ts`
- `src/player.ts`
- `src/providers/eska.ts`
- `src/providers/rmf.ts`
- `src/providers/trojka.ts`
- `src/state.ts`
- `src/statistics.ts`
- `src/types.ts`
- `src/ui.ts`
- `src/ui/catalog/markup.ts`
- `src/ui/catalog/modal.ts`
- `src/ui/elements.ts`
- `src/ui/history.ts`
- `src/ui/modal.ts`
- `src/ui/nowPlaying.ts`
- `src/ui/onboarding/modal.ts`
- `src/ui/settings/modal.ts`
- `src/ui/stationBrowser.ts`
- `src/ui/statistics.ts`
- `src/utils.ts`
- `styles/index.css`
- `styles/player/case.css`
- `styles/stations/now-playing.css`
- `tests/catalog.test.ts`
- `tests/eska.test.ts`
- `tests/favorites.test.ts`
- `tests/nowPlaying.test.ts`
- `tests/player.test.ts`
- `tests/rmf.test.ts`
- `tests/state.test.ts`
- `tests/stationBrowser.test.ts`
- `tests/statistics.test.ts`
- `tests/statisticsUI.test.ts`
- `tests/trojka.test.ts`

### Removed

- `src/blacklist.ts`
- `src/blacklistWarning.ts`
- `src/ui/blacklist/modal.ts`
- `src/ui/blacklist/warning.ts`
- `styles/history/blacklist-warning.css`
- `tests/blacklistWarning.test.ts`
