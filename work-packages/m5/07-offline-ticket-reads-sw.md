# WP-M5-07: assigned tickets stay readable offline (pwa)

format: small-model
status: done
depends-on: WP-M2-09a, WP-M2-18b
phase: 5
milestone: m5
context-budget: 16k tokens
spec: PLAN.md §10 (stale-while-revalidate, offline reading of assigned tickets), specs/09-offline.md §9.6
spec-lines: 30

files-read:

- apps/web/src/sw.ts — the existing precache and background-sync routes
- apps/web/src/lib/sw-routes.ts — `isPublicReportPath` matcher pattern and its tests
- apps/web/src/features/tickets/ticket-list-page.tsx — the list and detail GET paths
- apps/web/src/lib/api.ts — the API base path the matcher must respect

files-write:

- apps/web/src/lib/sw-routes.ts — `isInternalTicketRead(pathname)`
- apps/web/src/sw.ts — the stale-while-revalidate route
- apps/web/src/lib/__tests__/sw-routes.test.ts — matcher tests

interfaces:

- `isInternalTicketRead(pathname: string): boolean` — true for
  `<api-base>/v1/tickets` and `<api-base>/v1/tickets/<ticketNo>` (GET reads of
  list and detail), false for every other path, especially
  `/v1/tickets/<no>/accept`, `…/claim`, the public report and status paths
- a Workbox `StaleWhileRevalidate` route for GET on that matcher, named cache
  `internal-tickets`, `maxEntries: 50`, `maxAgeSeconds: 12 * 3600`; the response
  is the same session-authenticated JSON the online page already receives

## Task

1. Add the matcher next to `isPublicReportPath`; it must build on the same
   API-base handling (WP-M3-01) so a custom base still matches.
2. In `sw.ts` register `new NetworkOnly` → `StaleWhileRevalidate` only for that
   matcher and the `GET` callback; leave the report POST route and the
   update-control message handler untouched.
3. Tests: the matcher accepts list and detail paths, rejects action paths
   (`/accept`, `/claim`, `/comments`), the public paths and anything under a
   non-default API base except the ticket reads.

## Non-goals

- No offline object, text-template or on-call caches — phase 5 stays tickets.
- No new API endpoint or response change; only the transport is cached.
- No write path: the internal action POSTs keep network-only semantics.

## Acceptance

```bash
npm run typecheck -w @stoerdesk/web
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the matcher test fails before the change and passes after.
The offline read itself (airplane mode, list and detail from cache) is proven by
the E2E of WP-M5-08, not by this package.

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: WP-M5-08 (`m5/08-offline-internal-e2e.md`), WP-M5-09
  (`m5/09-clear-internal-cache-on-signout.md`) — the sign-out clear of the
  `internal-tickets` cache (shared devices)
- Open question: none
