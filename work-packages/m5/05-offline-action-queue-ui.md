# WP-M5-05: the detail page queues acknowledge, comment and decline offline (web)

format: small-model
status: planned
depends-on: WP-M5-01, WP-M5-04
phase: 5
milestone: m5
context-budget: 18k tokens
spec: PLAN.md §10 (offline writes go into the outbox, replayed in order)
spec-lines: 30

files-read:

- apps/web/src/features/tickets/ticket-detail-page.tsx — the action buttons and their POSTs
- apps/web/src/lib/outbox.ts — `enqueueInternalAction`, `replayInternalActions` (WP-M5-01)
- apps/web/src/lib/api.ts — `apiFetch` and the `ApiError`/network-error split
- apps/web/src/i18n/locales/de/ticket.json — the action label keys to extend
- apps/api/src/tickets/workflow-routes.ts — the exact acknowledge/decline bodies

files-write:

- apps/web/src/features/tickets/ticket-detail-page.tsx — queue on network failure
- apps/web/src/features/tickets/use-internal-actions.ts — queue, deliver, replay hook
- apps/web/src/lib/__tests__/use-internal-actions.test.ts — unit tests
- apps/web/src/i18n/locales/de/ticket.json and `en/ticket.json` — queue texts

interfaces:

- `useInternalActions(ticketNo: string)` — `{ queueAction(kind, payload),
  deliverNow(), pendingCount }`
- a network failure (no `ApiError`) on `acknowledge`, `decline` or the comment
  POST calls `enqueueInternalAction({ ticketNo, action, payload })` and the page
  shows the queued notice instead of an error
- an `ApiError` (400/403/409) keeps today's error rendering; it is never queued
- delivered actions carry the `clientUuid` of the outbox row in the request body
  (WP-M5-04)

## Task

1. `use-internal-actions.ts`: implement the hook over the WP-M5-01 functions;
   `deliverNow()` sends one row to its endpoint (`/v1/tickets/:ticketNo/…`) and
   applies the WP-M5-01 status rules (`sent` → remove, network error → `queued`
   with `retries + 1`).
2. `ticket-detail-page.tsx`: acknowledge (result + optional note), decline
   (reason) and the comment field keep their online flow; on a network error
   they enqueue and show `tickets.offlineQueued` with the pending count.
3. Register the queued notice so it also shows on reload: the hook reads
   `queuedActions()` filtered by `ticketNo` on mount.
4. Unit tests: network failure enqueues exactly one row with a stable
   `client_uuid`; an `ApiError` 409 does not enqueue; a later `deliverNow`
   removes the row; the comment payload travels unchanged.

## Non-goals

- No conflict banner and no `conflict` row rendering — WP-M5-06.
- No service-worker caching of reads — WP-M5-07.
- No offline claim/accept: claiming from the pool stays online-only
  (`specs/09-offline.md` §9.6).

## Acceptance

```bash
npm run typecheck -w @stoerdesk/web
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; i18n parity de/en for the new keys.

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: WP-M5-06 (`m5/06-conflict-ui-offline-writes.md`)
- Open question: none
