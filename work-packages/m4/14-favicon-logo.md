# WP-M4-14: Favicon from company logo

format: small-model
status: planned
depends-on: —
phase: 4
context-budget: 12k tokens
spec: PLAN.md §14
spec-lines: 15

files-read:

- apps/web/index.html — current `<link rel="icon">` points at `favicon.svg`
- apps/web/vite.config.ts — VitePWA `includeAssets` + manifest icon reference `favicon.svg`
- apps/web/public/favicon.svg — current generic triangle favicon mark
- apps/web/public/logo.png — company brand logo, 128 × 120, used in the shell header

files-write:

- apps/web/index.html — `<link rel="icon">` now references `/logo.png`
- apps/web/vite.config.ts — `includeAssets` and manifest `icons` reference `/logo.png`

interfaces:

- none (asset reference swap only)

## Task

1. Replace the favicon `<link>` in `apps/web/index.html` so the tab/bookmark icon is `/logo.png` (`type="image/png"`) instead of the generic `/favicon.svg` triangle mark.
2. Point `VitePWA` `includeAssets` and the manifest `icons` entry at `/logo.png` so PWA installs use the company logo.
3. Keep `apps/web/public/favicon.svg` in place but unreferenced (no deletion, no tracing of the raster logo).

## Non-goals

- No vectorisation of `logo.png`.
- No `apple-touch-icon` or additional icon sizes.
- No i18n change, no integration with the configurable company logo (WP-M4-09a/09b).
- No new source files.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
npm run build
```

Expected: all green; `/logo.png` is referenced as page favicon and PWA icon after the change.

## Handoff

- Files changed: `apps/web/index.html`, `apps/web/vite.config.ts`, `work-packages/m4/14-favicon-logo.md`
- Interfaces added: none
- Verified: typecheck, eslint, vitest, i18n:check, wp:check, build
- Follow-up WP: none
- Open question: none
