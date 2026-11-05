# WP-M7-04c: the outbox drain worker and its pg-boss schedule

format: small-model
status: planned
depends-on: WP-M7-04 (outbox rows in the create transaction), WP-M7-04b (the localized ntfy label)
phase: 7
context-budget: 20k tokens
spec: PLAN.md §12 (Notifications — outbox in the same transaction, then a worker; 3 retries with backoff; `notification_sent`/`notification_failed` events), PLAN.md §16 (Phase 7)
spec-lines: 26

Split from the announced package "the outbox worker and the localized ntfy action label"
(`PLAN.md` §17: the drain needs `outbox.ts` and the direct-start wiring in `index.ts`, which
together with the label files of WP-M7-04b exceeds the four-file limit). The label is done in
WP-M7-04b; this WP drains the rows.

files-read:

- apps/api/src/notifications/outbox.ts — `enqueueOutbox`, `OutboxRow`, `messageParams` (WP-M7-04)
- apps/api/src/notifications/channels/index.ts — `configuredChannels(env)`, `NotificationChannel`, `NotificationMessage`
- apps/api/src/notifications/channels/ntfy.ts — `sendNtfyNotification`, `NtfyConfig` with `locale` (WP-M7-01, WP-M7-04b)
- apps/api/src/jobs/bma-sync.ts — the pg-boss queue shape with a short-lived pool per job
- apps/api/src/tickets/workflow.ts — `transitionTicket()` and the `ticketEvents` insert pattern
- apps/api/src/index.ts — the direct-start block that starts the other pg-boss jobs

files-write:

- apps/api/src/notifications/outbox.ts — `drainOutbox`, `startNotificationOutboxJob`
- apps/api/src/index.ts — start the job from the direct API start only
- apps/api/src/notifications/__tests__/outbox-worker.unit.spec.ts — mocked channel drain
- apps/api/src/notifications/__tests__/outbox.integration.spec.ts — claims, states and events on PostgreSQL

interfaces:

- `drainOutbox(database, env, log?): Promise<OutboxDrainResult>` — takes `PENDING` rows oldest first, claims one row atomically (`UPDATE ... WHERE state = 'PENDING'` + `returning`), sends through `configuredChannels(env)`, retries up to three attempts with backoff, writes `SENT`/`FAILED` plus `attempts`/`updated_at` and appends exactly one `notification_sent` or `notification_failed` event per row
- `OutboxDrainResult = { sent: number, failed: number, attempts: number }` — aggregate counters, never contact data
- `startNotificationOutboxJob(connectionString, env, log?): Promise<PgBoss>` — pg-boss queue drained on a one-minute schedule, one short-lived pool per job, started only from the direct API start (`buildServer()` and the test suite never create the pg-boss schema)
- the events carry `actorKind: 'system'` and a payload of `{ channel, ticketNo, attempts }` — the ticket and its `created` event are already written in WP-M7-04, so a channel failure never loses them

## Task

1. `outbox.ts`: `claimOutboxRow(database)` claims the oldest `PENDING` row with one atomic
   `update(outbox).where(state = 'PENDING').returning()` plus the `(state, created_at)` index of
   migration 0019, and returns `undefined` when nothing is pending.
2. `outbox.ts`: `drainOutbox` loops over claims, resolves the channel of the row by name from
   `configuredChannels(env)`, sends the message built from the row's `target` params (ticket
   number, priority, object name — no photo, no contact data), retries up to three attempts with
   backoff, writes the state and appends the `notification_sent`/`notification_failed` event to
   `ticket_events`. A row whose channel name is no longer configured ends `FAILED`.
3. `outbox.ts`: `startNotificationOutboxJob(connectionString, env, log?)` follows
   `jobs/bma-sync.ts`: `createQueue`, `work` with one `createDatabase(connectionString)` per job
   closed in `finally`, `schedule` every minute; export the queue name and cron for tests.
4. `index.ts`: start it in the direct-start block next to the other jobs and stop it in the
   existing `onClose` hook. `buildServer()` stays job-free.
5. Tests: a mocked channel that fails twice then succeeds ends `SENT` with three attempts; a
   channel that always fails ends `FAILED` and leaves one `notification_failed` event; the
   integration spec against PostgreSQL asserts the claims, the states, `attempts` and that the
   `created` event of the ticket is still there; the payload of the ntfy row carries the
   localized action label of WP-M7-04b.

## Non-goals

- No escalation chain across channels (`PLAN.md` §12 "next channel in the escalation chain"
  stays with the escalation rules, not with this worker).
- No dashboard tile with channel status (phase 9), no admin warning UI.
- No admin channel registry route, no per-user channel choice, no web push, Telegram, SMTP,
  Signal or Matrix worker change.
- No notification for transitions other than the public report create path (WP-M7-04 only
  enqueued rows there).

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

- Files changed: —
- Interfaces added: —
- Deviation: —
- Follow-up WP: none
- Open question: none
