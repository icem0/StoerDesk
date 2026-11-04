# WP-M3-01: Offline background sync matches the API path

format: small-model
status: implemented
depends-on: WP-M2-09a
phase: 3
milestone: m3
context-budget: 12k tokens
spec: specs/09-offline.md §9.4
spec-lines: 45

files-read:

- specs/09-offline.md (§9.2–§9.4)
- apps/web/src/sw.ts
- apps/web/src/lib/api.ts
- apps/web/src/lib/outbox.ts
- work-packages/m2/09a-service-worker.md

files-write:

- apps/web/src/lib/sw-routes.ts
- apps/web/src/lib/__tests__/sw-routes.test.ts
- apps/web/src/sw.ts

interfaces:

- `isPublicReportPath(pathname: string): boolean` — `true` for the public report POST path with or without an API base

## Task

The phase 3 closure found the Workbox route predicate of the service worker
matching the bare path `/v1/public/tickets`, while the web app sends through
`apiFetch('/v1/public/tickets')` and therefore requests
`/api/v1/public/tickets`. The background-sync queue was dead for the shipped
API base. Fix the predicate without changing the outbox or the online path:

1. Add `apps/web/src/lib/sw-routes.ts` with `isPublicReportPath(pathname)`:
   match the public report path by its `/v1/public/tickets` suffix, so both
   `/api/v1/public/tickets` and `/v1/public/tickets` work.
2. Use the predicate in `apps/web/src/sw.ts` instead of the string equality.
3. Add `apps/web/src/lib/__tests__/sw-routes.test.ts`: the report path matches
   with and without the base, while `/open`, `/:ticketNo/status` and
   `/:ticketNo/comments` do not.

## Non-goals

- No change to the Dexie outbox, `replayOutbox`, the form UI or the report API.
- No stale-while-revalidate cache for objects or the fault catalog (later phase).
- No offline internal reads or writes (phase 5).
- No new service-worker registration or manifest work.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
npm run build
E2E_CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e
```

Expected: all green; the offline E2E proves one ticket after reconnect in `de`
and `en`; `dist/sw.js` still precaches the app shell.

## Handoff

- Files changed: `sw-routes.ts` (new), its test (new) and `sw.ts`
- Interfaces added: `isPublicReportPath`
- Verified: `npm run check` green (E2E green with the distribution Chromium);
  `npm run build` green; offline E2E `de`/`en` green
- Follow-up WP: none — phase 3 is complete with this commit
- Open question: none
