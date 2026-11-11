# WP-M5-17: the ticket view shows a write immediately

format: small-model
status: done
depends-on: WP-M5-07
phase: 5
milestone: m5
context-budget: 14k tokens
spec: PLAN.md §10 (offline reads of internal tickets), specs/09-offline.md §9.6
spec-lines: 20

files-read:

- apps/web/src/sw.ts — the precache, the report queue and the stale-while-revalidate route
- apps/web/src/lib/sw-routes.ts — the route predicates of the service worker
- apps/web/src/features/tickets/ticket-detail-page.tsx — the refetch after a write

files-write:

- apps/web/src/lib/sw-routes.ts — `isInternalTicketWrite(pathname)`
- apps/web/src/sw.ts — the write route and the cache invalidation
- apps/web/src/__tests__/sw.test.ts — the invalidation test
- apps/web/src/lib/__tests__/sw-routes.test.ts — the matcher test

interfaces:

- `isInternalTicketWrite(pathname: string): boolean` — true for
  `<api-base>/v1/tickets/<ticketNo>/<action>`, false for the reads, the list
  and the public report and comment routes
- `ticketDetailUrl(writeUrl: string): string | null` — the detail URL of a
  write URL, `null` for every other URL
- `invalidateCachedTicket(cacheStorage: CacheStorage, writeUrl: string): Promise<void>`
  — drops the cached copy of the written ticket from `internal-tickets`
- a Workbox `NetworkOnly` route for POST on the write matcher; the successful
  write invalidates the cached detail of that ticket

## Task

1. The detail of a ticket is served from the `internal-tickets` cache with
   `StaleWhileRevalidate` (WP-M5-07), so the refetch after a write answered
   with the copy from before the write: a new comment stayed invisible until
   the next reload. The write route now drops that copy.
2. Add the matcher `isInternalTicketWrite` next to `isInternalTicketRead`; it
   must build on the same API-base handling, so a build with a custom base
   still matches.
3. Register a `NetworkOnly` route for `POST` on that matcher with a plugin
   that deletes the cached detail of the written ticket after a successful
   response. The public report route, the background-sync queue and the
   stale-while-revalidate route stay untouched.
4. Tests: the matcher accepts the comment and the workflow actions and rejects
   the reads and the public routes; the invalidation deletes the entry of the
   written ticket and keeps the entries of the other tickets.

## Non-goals

- No change of the cache strategy: the offline read of WP-M5-07 stays
  stale-while-revalidate, the write stays network-only.
- No new API route and no change of the ticket answer.
- No invalidation of the ticket list; only the detail of the written ticket is
  dropped.

## Acceptance

```bash
npm run typecheck -w @stoerdesk/web
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new tests fail before the change and pass after it.

## Handoff

- Files changed: `apps/web/src/lib/sw-routes.ts`, `apps/web/src/sw.ts`,
  `apps/web/src/__tests__/sw.test.ts`, `apps/web/src/lib/__tests__/sw-routes.test.ts`
- Interfaces added: `isInternalTicketWrite()`, `ticketDetailUrl()`,
  `invalidateCachedTicket()`
- Verified: `npm run typecheck -w @stoerdesk/web`, `npm run lint`,
  `npm run test:run`, `npm run i18n:check`, `npm run wp:check`
- Follow-up WP: none
- Open question: none
