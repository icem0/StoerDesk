# WP-M22-01: the service worker takes over at once

format: small-model
status: done
depends-on: —
phase: 22
milestone: m22
context-budget: 18k tokens
spec: specs/09-offline.md §9.4
spec-lines: 30

files-read:

- apps/web/src/sw.ts (the service worker of the PWA)
- apps/web/src/main.tsx (the registration of the service worker)
- apps/web/nginx-pwa.conf.template (the nginx config of the web image)
- apps/web/src/__tests__/sw.test.ts (the test of the service worker)
- apps/web/src/__tests__/pwa-manifest.test.ts (the test of the manifest)

files-write:

- apps/web/src/sw.ts, apps/web/src/main.tsx
- apps/web/nginx-pwa.conf.template
- apps/web/src/__tests__/sw.test.ts, apps/web/src/__tests__/pwa-manifest.test.ts
- specs/09-offline.md (§9.4)

interfaces:

- `registerTakeover(scope: ServiceWorkerScope, events: ServiceWorkerEvents): void`
  — the new version of the service worker replaces the old one without waiting
  for the tabs of the old version and takes the open pages over
- `ServiceWorkerScope` / `ServiceWorkerEvents` — the two shapes the takeover
  needs, so the test can hand over its own doubles

## Task

1. Add `registerTakeover` to `apps/web/src/sw.ts` and call it with `self`: the
   `install` listener waits for `skipWaiting()`, the `activate` listener waits
   for `clients.claim()`. The precache holds the shell of the app, so a
   browser that keeps the old worker also keeps the old shell — a document
   without the `<link rel="manifest">` of the build, and the browser offers no
   install of the app.
2. Force the update check on the start of the app in `apps/web/src/main.tsx`:
   `register('/sw.js').then((registration) => registration.update())`. The
   browser compares the script of the worker at most once a day, so without the
   forced check the new worker arrives days later.
3. Serve the shell of the app with `Cache-Control: no-cache` in
   `apps/web/nginx-pwa.conf.template` (`location = /index.html`), so a copy
   from the HTTP cache cannot hide the manifest link of the build either.
4. Name the behaviour in `specs/09-offline.md` §9.4.
5. Test: `registerTakeover` registers the `install` and the `activate` listener
   and waits for `skipWaiting()` and `clients.claim()`; the nginx template
   carries the mime type of the manifest and the rule of the shell.

## Non-goals

- No change of the precache, the background-sync queue or the push handlers.
- No change of the manifest itself (the icons of WP-M14-157 stay).
- No install button in the interface and no change of the web-push card.
- No change of the API, the database or the channels.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the new tests fail before the change and pass after it.

## Handoff

- Files changed: the service worker, the start of the app, the nginx template
  and the spec
- Interfaces added: `registerTakeover`, `ServiceWorkerScope`,
  `ServiceWorkerEvents`
- Verified: the commands above
- Follow-up WP: none — phase 22 is closed
- Open question: none
