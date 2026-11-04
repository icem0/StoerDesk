# WP-M5-01: the outbox stores queued internal actions (web)

format: small-model
status: implemented
depends-on: WP-M2-09, WP-M2-19b
phase: 5
milestone: m5
context-budget: 14k tokens
spec: PLAN.md §10 (offline architecture), PLAN.md §16 phase 5, specs/09-offline.md §9.6
spec-lines: 60

files-read:

- apps/web/src/lib/outbox.ts — the Dexie v1 report outbox and its replay loop
- apps/web/src/main.tsx — app start and `online` replay triggers
- apps/web/src/features/tickets/ticket-detail-page.tsx — the action buttons that queue later
- apps/web/src/lib/sw-routes.ts — the route matcher style to reuse
- specs/09-offline.md (§9.2, §9.6)

files-write:

- apps/web/src/lib/outbox.ts — Dexie v2 with the `internal_actions` table
- apps/web/src/lib/__tests__/outbox-actions.test.ts — unit tests with `fake-indexeddb`
- apps/web/package.json — `fake-indexeddb` as devDependency
- apps/web/src/main.tsx — `replayInternalActions()` on app start and `online`

interfaces:

- `type InternalActionKind = 'acknowledge' | 'comment' | 'decline'`
- `interface QueuedAction { id?: number; client_uuid: string; ticket_no: string;
  action: InternalActionKind; payload: Record<string, unknown>;
  status: 'queued' | 'sending' | 'sent' | 'failed' | 'conflict';
  error_code?: string; ticket_status?: string; retries: number; created_at: number }`
- `enqueueInternalAction(input: { ticketNo: string; action: InternalActionKind;
  payload: Record<string, unknown> }): Promise<number>`
- `queuedActions(): Promise<QueuedAction[]>` — oldest first
- `updateAction(id: number, changes: Partial<QueuedAction>): Promise<void>`
- `removeAction(id: number): Promise<void>`
- `pendingWrites(): Promise<{ reports: number; actions: number }>`
- `replayInternalActions(): Promise<{ sent: number; failed: number }>` — this WP
  delivers the loop skeleton; the endpoint wiring is WP-M5-04

## Task

Phase 5 queues the offline internal writes named by `PLAN.md` §10 (acknowledge,
comment, decline). This WP only widens the local storage; nothing sends yet.

1. Bump `OutboxDb` to `version(2)` and add the `internal_actions` table with the
   index `'++id, client_uuid, ticket_no, status, created_at'`; keep `outbox`
   (report rows) exactly as it is, so existing queued reports survive the upgrade.
2. Implement the interfaces above; `enqueueInternalAction` generates its own
   `client_uuid` (`crypto.randomUUID()`) — this is the idempotency key the API
   receipts of WP-M5-02 will deduplicate on.
3. Add `replayInternalActions()` with the same oldest-first loop as
   `replayOutbox()`, but deliver via a named `deliverAction(row)` helper that
   this WP marks `failed` on every non-network answer; WP-M5-04 replaces it.
4. Call `replayInternalActions()` in `main.tsx` beside `replayOutbox()` on app
   start and on the `online` event.
5. Unit-test enqueue, oldest-first order, `updateAction` status transitions
   (including `conflict`) and `pendingWrites` counts against `fake-indexeddb`.

## Non-goals

- No endpoint wiring, receipts or conflict decisions — WP-M5-02 … WP-M5-04.
- No UI: no queue banner and no offline queueing in the detail page (WP-M5-06/07).
- No confirm/decline-shift actions — the on-call calendar is phase 8.
- No change to the report outbox semantics (`specs/09-offline.md` §9.2–§9.5).

## Acceptance

```bash
npm run typecheck -w @stoerdesk/web
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the new outbox tests fail before the change and pass after.

## Handoff

- Files changed: `apps/web/src/lib/outbox.ts` (Dexie v2, queue API),
  `apps/web/src/main.tsx` (replay triggers), new
  `apps/web/src/lib/__tests__/outbox-actions.test.ts` (9 tests, `fake-indexeddb`
  as new web devDependency)
- Interfaces added: `InternalActionKind`, `QueuedAction`,
  `enqueueInternalAction`, `queuedActions`, `updateAction`, `removeAction`,
  `deliverAction`, `replayInternalActions`, `pendingWrites`
- Verified: `npm run check` green including the real E2E suite 10/10
  (local PostgreSQL + system Chromium via `E2E_CHROMIUM_PATH`); the 9 new unit
  tests fail before the change and pass after
- Follow-up WP: WP-M5-02 (`m5/02-internal-action-receipts-table.md`)
- Open question: none
