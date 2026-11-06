# WP-M7-05: the notification channel fallback chain

format: small-model
status: implemented
depends-on: WP-M7-04 (outbox rows in the create transaction), WP-M7-04c (the outbox drain worker, its retries and its pg-boss schedule)
phase: 7
context-budget: 18k tokens
spec: PLAN.md §12 (Notifications — "3 retries with backoff, then the next channel in the escalation chain"; `notification_sent`/`notification_failed` events), PLAN.md §16 (Phase 7 exit criterion: "channel failure retries and falls back; history shows it")
spec-lines: 14

WP-M7-04c drains a row on its own channel and ends it `FAILED` after three attempts —
the second half of the exit criterion ("then the next channel in the escalation chain")
was its explicit non-goal. This WP adds that half, inside the same worker.

files-read:

- apps/api/src/notifications/outbox.ts — `claimOutboxRow`, `drainOutbox`, `finishRow`, `OutboxDrainResult`, `OutboxRow` (WP-M7-04, WP-M7-04c)
- apps/api/src/notifications/channels/index.ts — `configuredChannels(env)` and its order (signal → matrix → ntfy)
- apps/api/src/notifications/channels/signal.ts — the signal adapter's `fetch` call (for the mocked fallback send)
- apps/api/src/notifications/channels/matrix.ts — the matrix adapter's `fetch` call
- apps/api/src/db/schema.ts — the `outbox` table (`state`, `attempts`, column defaults of migration 0019)

files-write:

- apps/api/src/notifications/outbox.ts — `escalationChain`, `finishRow` fallback insert, `OutboxDrainResult.fallback`
- apps/api/src/notifications/**tests**/outbox-worker.unit.spec.ts — fallback, pending guard, chain end
- apps/api/src/notifications/**tests**/outbox.integration.spec.ts — fallback row and events on PostgreSQL

interfaces:

- `escalationChain(env): string[]` — the configured channel names in `configuredChannels` order; the chain of an unconfigured channel position ends
- `finishRow(database, row, state, eventType, fallbackChannel?): Promise<boolean>` — `true` when a fallback row was queued in the same transaction as the `notification_failed` event
- the fallback row is a new `PENDING` row for the next channel with the same `ticketId` and the same machine-readable `target` params — no photo, no contact data
- `OutboxDrainResult = { sent, failed, fallback, attempts }` — aggregate counters only

## Task

1. `outbox.ts`: `escalationChain(env)` returns `configuredChannels(env).map((c) => c.name)`.
2. `outbox.ts`: in the exhausted-retry branch of `drainOutbox`, take the next chain entry
   after `row.channel`. With a next channel, `finishRow` ends the row `FAILED`, appends the
   `notification_failed` event and — only if no `PENDING` row of the same ticket already
   exists for that channel — inserts one `PENDING` fallback row in the same transaction
   (`state`, `attempts`, `created_at` stay on the migration-0019 defaults). The drain loop
   continues, so the fallback row is claimed in the same run (chain length bounds the run).
3. `outbox.ts`: `OutboxDrainResult` gains `fallback`; the job log line reports it with the
   code `channel_fallback`.
4. Tests: an exhausted row with a configured next channel ends `FAILED` and the fallback
   row ends `SENT` on that channel with one `notification_failed` and one
   `notification_sent` event; an exhausted row whose next channel still has a `PENDING`
   row queues no fallback; the last channel of the chain ends `FAILED` without fallback;
   the integration spec proves the fallback row, both states and both events on
   PostgreSQL.

## Non-goals

- No escalation rules across events or actors (`PLAN.md` §9 "notify assignee and manager"),
  no mandatory minimum channels for `critical` (§12 admin rule) — this WP chains channels
  of one row only.
- No web push, Telegram or SMTP adapter, no admin channel registry route, no dashboard tile.
- No change to `enqueueOutbox`: WP-M7-04 still queues one row per configured channel.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green. The unit spec needs no database; the integration spec skips and is
reported as unverified without PostgreSQL — CI has the service.

## Handoff

- Files changed: `apps/api/src/notifications/outbox.ts` (`escalationChain`, `finishRow` with
  the fallback insert and its pending guard, `OutboxDrainResult.fallback`, the `channel_fallback`
  log line), plus the two test specs (excluded from the file limit of §17).
- Interfaces added: `escalationChain(env)`, `finishRow(..., fallbackChannel?): boolean`,
  `OutboxDrainResult.fallback`.
- Deviation: none.
- Follow-up WP: none
- Open question: none
