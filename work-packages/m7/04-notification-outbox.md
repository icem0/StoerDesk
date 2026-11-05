# WP-M7-04: notification outbox rows written with the ticket event

format: small-model
status: planned
depends-on: WP-M7-01 (ntfy adapter), WP-M7-03 (subscription card)
phase: 7
context-budget: 20k tokens
spec: PLAN.md §12 (Notifications — outbox in the same transaction), PLAN.md §16 (Phase 7), specs/10-notifications.md
spec-lines: 30

files-read:

- apps/api/src/db/schema.ts — `tickets`, `ticketEvents`, `uuidDefault`
- apps/api/src/tickets/report.ts — the public create path and its transaction
- apps/api/src/tickets/internal.ts — the internal create path
- apps/api/src/notifications/channels/index.ts — `configuredChannels(env)`
- apps/api/src/config/env.ts — the channel keys
- apps/api/src/db/migrations/0013_internal_action_receipts.sql — hand-written migration pattern

files-write:

- apps/api/src/db/schema.ts — `notificationChannels`, `pushSubscriptions`, `outbox` tables
- apps/api/src/db/migrations/0019_notification_outbox.sql — the three tables plus indexes
- apps/api/src/notifications/outbox.ts — `enqueueOutbox`, `OutboxRow`
- apps/api/src/tickets/report.ts — one outbox row per configured channel inside the create transaction

interfaces:

- `outbox` table: `id` UUID v7, `ticket_id` FK, `channel` (name), `target` (jsonb), `state` check `PENDING`/`SENT`/`FAILED`, `attempts` int default `0`, `created_at`, `updated_at`, index `outbox(state, created_at)`
- `notification_channels` + `push_subscriptions`: admin-facing channel registry and web-push tokens (rows only in this WP, no routes)
- `enqueueOutbox(database, ticket, env): number` — one `PENDING` row per configured channel, never a request
- the create path never calls a channel: a channel failure can never lose the event (`PLAN.md` §12)

## Task

1. `0019_notification_outbox.sql` + `schema.ts`: the three tables of `PLAN.md` §6
   (`notification_channels`, `push_subscriptions`, `outbox`) with the `state` check,
   the `outbox(state, created_at)` index and UUID v7 keys.
2. `notifications/outbox.ts`: `enqueueOutbox` inserts one `PENDING` row per channel of
   `configuredChannels(env)` for the given ticket — pure insert, no HTTP.
3. `report.ts`: inside the create transaction, after the ticket and its `created`
   event are written, call `enqueueOutbox`; the row carries the ticket number, the
   priority and the object name as the message parameters, no photos, no contact data.
4. Test (`notifications/__tests__/outbox.unit.spec.ts`): a configured ntfy channel
   yields exactly one `PENDING` row, an unconfigured environment yields none.

## Non-goals

- No worker, no request, no retries — draining the queue is WP-M7-04b.
- No admin routes for the channel registry (`settings.*` UI is a later WP).
- No web push (VAPID keys are in the environment already, the channel is not built).
- No QR subscription card change — WP-M7-03 shipped it.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green. The unit test needs no database; the create-path test needs
PostgreSQL and is skipped (reported as unverified) without one — CI has the service.

## Handoff

- Files changed: —
- Interfaces added: —
- Deviation: —
- Follow-up WP: WP-M7-04b (the outbox worker, the retries and the localized ntfy action label)
- Open question: none
