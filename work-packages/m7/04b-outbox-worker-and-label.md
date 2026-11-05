# WP-M7-04b: the outbox worker and the localized ntfy action label

format: small-model
status: planned
depends-on: WP-M7-04 (outbox rows in the create transaction)
phase: 7
context-budget: 20k tokens
spec: PLAN.md §12 (Notifications — retries, events, channel failure), PLAN.md §3.1 (server text through `t()`)
spec-lines: 30

files-read:

- apps/api/src/notifications/outbox.ts — `enqueueOutbox`, `OutboxRow` (WP-M7-04)
- apps/api/src/notifications/channels/index.ts — `configuredChannels(env)`, `NotificationChannel`
- apps/api/src/jobs/bma-sync.ts — the pg-boss queue pattern with a short-lived pool
- apps/api/src/tickets/workflow.ts — `transitionTicket()` and the event write pattern
- packages/shared/src/i18n/t.ts — the server `t()` over `server.{de,en}.json`

files-write:

- apps/api/src/notifications/outbox.ts — `drainOutbox`, the pg-boss queue, `notification_sent`/`notification_failed` events
- apps/api/src/notifications/channels/ntfy.ts — the action label from `t()`, no German literal
- packages/shared/src/i18n/server.de.json — `notification.action_label`
- packages/shared/src/i18n/server.en.json — `notification.action_label`

interfaces:

- `drainOutbox(database, env, log?): Promise<OutboxDrainResult>` — takes `PENDING` rows oldest first, sends through the channel, on failure retries up to three times with backoff, marks `SENT` or `FAILED` and appends one `notification_sent`/`notification_failed` ticket event
- `startNotificationOutboxJob(connectionString, env, log?)` — a pg-boss queue drained every minute, short-lived pool per job, started only from the direct API start (never in `buildServer`, never in tests)
- `NtfyConfig` gains `locale` — the `view` action label is `t(locale, 'notification.action_label')`, so no German literal reaches a payload (`PLAN.md` §3.1)
- channel failure never loses the ticket event: the ticket and its `created` event are already written in WP-M7-04

## Task

1. `server.{de,en}.json`: `notification.action_label` (German reference "Öffnen", English "Open"); `ntfy.ts` reads it through the shared `t()` with the locale from `NtfyConfig` — the hard-coded German label of WP-M7-01 is gone.
2. `outbox.ts`: `drainOutbox` claims `PENDING` rows (atomic `UPDATE ... WHERE state = 'PENDING'`), sends, retries three times with backoff, writes the state and appends the `notification_sent`/`notification_failed` event to `ticket_events`.
3. `outbox.ts`: `startNotificationOutboxJob` runs the drain through a pg-boss queue on a one-minute schedule with one short-lived pool per job, following `jobs/bma-sync.ts`; the API start starts it, `buildServer` and the test suite never create the pg-boss schema.
4. Tests: a mocked channel that fails twice then succeeds ends `SENT` with three attempts; a channel that always fails ends `FAILED` and leaves a `notification_failed` event; the ntfy payload answers the localized label in `de` and `en`.

## Non-goals

- No escalation chain across channels (`PLAN.md` §12 "next channel in the escalation chain" is the escalation WP of phase 6/7 rules).
- No dashboard tile for channel status (phase 9).
- No admin channel registry UI, no per-user channel choice — rows exist, the UI is a later WP.
- No Telegram, SMTP, Web Push, Signal or Matrix worker change.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; `i18n:check` confirms the de/en parity of `server.notification.action_label`.

## Handoff

- Files changed: —
- Interfaces added: —
- Deviation: —
- Follow-up WP: none
- Open question: none
