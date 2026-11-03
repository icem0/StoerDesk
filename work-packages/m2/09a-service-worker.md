# WP-M2-09a: Service Worker and offline sync

format: small-model
status: implemented
depends-on: WP-M2-09
phase: 2
milestone: m2
context-budget: 18k tokens
spec: PLAN.md §10 (offline report and sync)
spec-lines: 0

files-read:

- PLAN.md §10
- apps/web/src/main.tsx
- apps/web/vite.config.ts
- apps/web/src/lib/outbox.ts
- apps/web/src/features/tickets/report-form-page.tsx

files-write:

- apps/web/src/sw.ts
- apps/web/src/main.tsx
- apps/web/vite.config.ts

interfaces:

- `registerServiceWorker(): Promise<ServiceWorkerRegistration | undefined>`
- `sw.js` precaches the app shell (Workbox `injectManifest`)
- `sync-report` background-sync tag that calls `replayOutbox()`

## Task

Make the report form loadable offline and retry waiting reports automatically.

1. Switch `vite.config.ts` to VitePWA `injectManifest` mode with `src/sw.ts` as the service worker source, so the app shell, JS, CSS and icons are precached.
2. Write `apps/web/src/sw.ts`: import `workbox-precaching` and call `precacheAndRoute(self.__WB_MANIFEST)`; register a `BackgroundSyncPlugin` with the tag `sync-report` that replays the outbox (`replayOutbox()` from `apps/web/src/lib/outbox.ts`) when the connection returns.
3. Register the service worker in `main.tsx`, call `replayOutbox()` once on app start, and add a `window` `online` listener that triggers `replayOutbox()` so reports waiting in the outbox are sent as soon as the browser is back online.
4. Keep the registration graceful: in browsers without service workers the app still works online as today.

## Non-goals

- The Playwright offline E2E test (WP-M2-09b).
- Native push or background fetch.
- iOS Background Sync (not available; the `online` listener and app-start replay cover it).

## Acceptance

Run and report the exact commands:

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
npm run build
```

Expected result: all green; the service worker is generated into `dist/sw.js`; no
literal UI string added.

## Handoff

- Files changed: `apps/web/src/sw.ts` (new), `apps/web/src/main.tsx`, `apps/web/vite.config.ts`
- Interfaces added: `registerServiceWorker`, `sync-report` background-sync tag
- Verified: `npm run check` and `npm run build` green
- Follow-up WP: WP-M2-09b (offline E2E test) — its WP file is created in this same commit
- Open question (if any): none
