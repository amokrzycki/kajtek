# AGENTS.md — KAJTEK Radio

Guidance for AI coding agents (Claude Code, OpenCode, Antigravity/Gemini CLI, etc.) working in this repo.

## What this is

Ultra-lightweight retro-style web internet radio player, vanilla TypeScript, no framework. See `README.md` for features, `PRODUCT.md` for product intent/principles, `DESIGN.md` for the design system (colors, typography, spacing — canon, don't replace ad hoc).

## Stack

- TypeScript (strict), no framework — DOM manipulation directly in `src/ui*`.
- esbuild for bundling (`src/app.ts` → `dist`), plain CSS in `styles/` bundled the same way.
- Only runtime dependency: `hls.js`.
- Node version pinned in `.nvmrc`.

## Commands

```bash
npm run dev     # dev server (dev.mjs) with esbuild watch + RMF API proxy, http://localhost:3000
npm run check   # tsc --noEmit
npm run lint    # biome check (lint + format check)
npm run build   # check + lint + esbuild bundle + assets + hash injection into dist/
```

Run `npm run check` and `npm run lint` before considering a change done — CI (`ci.yml`) runs both on push/PR to `main`.

## Code style

- Formatting/linting: **Biome**, not ESLint/Prettier. Config in `biome.json`: 2-space indent, double quotes, semicolons, trailing commas, 120 col width, `organizeImports` on.
- No comments unless explaining non-obvious "why"
- `noExplicitAny`, `noUnusedImports`, `noUnusedVariables` are lint errors — keep code clean, no `any`, no dead imports.
- `tsconfig.json` is strict: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noUnusedLocals/Parameters` all on. Respect these, don't silence with casts/`!`.
- `console.log` is a lint warning (only `console.error`/`console.warn` allowed).

## Project structure

See `README.md`'s "Project Structure" section for the authoritative, maintained file-by-file map of `src/`, `styles/`, and tooling — read it before making structural changes, and update it if you add/rename/remove files or modules.

Key architecture points:

- `state.ts` — local state store + subscription system (no external state lib).
- `providers.ts` / `providers/` — one module per radio network (RMF, Trojka, Eska, generic).
- `ui.ts` + `ui/` — DOM rendering split by feature area (catalog, blacklist, settings, changelog, onboarding, favorites, history).
- `player.ts` — playback, polling, metadata, failover logic — central and sensitive; check callers before changing.

## Working conventions

- **CHANGELOG.md**: user-facing, one `## <version>` section per release, matching `package.json` version. Update when shipping a user-visible change; the app parses this file to show new-version notices.
- **Design system** (`styles/`, `DESIGN.md`) is locked/canon per `PRODUCT.md` — extend deliberately, don't genericize or replace the retro PRL visual language.
- Don't add a framework or new runtime dependency without strong justification — "ultra-lightweight, zero-framework" is a stated product principle.
- CodeGraph index exists (`.codegraph/`) — agents with access should query it (`codegraph_explore` / `codegraph explore`) before grepping/reading files to locate symbols and call paths.
- **Browser QA**: use Playwright directly only, never headless.

## Git / commits

- Never commit without being explicitly asked — the repo owner commits themselves.
- Conventional-ish commit prefixes in history: `Feat:`, `Fix:`, `Refactor:`, `Docs:`, `Chore:`.

## CI/CD

- `.github/workflows/ci.yml`: Biome + `tsc` check on push/PR to `main`.
- `.github/workflows/deploy.yml`: build + SSH/rsync deploy on `v*` tags.
