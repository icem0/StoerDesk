# WP-M14-28: A readiness row is queued and drained like a ticket row

format: small-model
status: planned
depends-on: WP-M14-27, WP-M14-16
phase: 14
milestone: m14
context-budget: 20k tokens
spec: specs/10-notifications.md §11.4, §11.5, §11.7 (ADR-0021)
spec-lines: 60

files-read:

- apps/api/src/notifications/outbox.ts (`enqueueOutbox`, `outboxRows`, `drainOutbox`, `messageOf`)
- apps/api/src/notifications/accounts.ts (the account of a user at a channel, WP-M14-08)
- packages/shared/src/schemas/notification.ts (the preferences contracts of WP-M14-16)
- apps/api/src/db/schema.ts (`outbox` after WP-M14-27, `notificationPreferences`)
- apps/api/src/notifications/__tests__/outbox.integration.spec.ts (the drain test pattern)

files-write:

- packages/shared/src/schemas/notification.ts
- apps/api/src/notifications/outbox.ts
- apps/api/src/notifications/__tests__/readiness-outbox.integration.spec.ts

interfaces:

- `oncallShiftMessageSchema` — `{ poolName, startsAt, endsAt, state, shiftId }` (the readiness
  message parameters of §11.5; machine values only, no translated text)
- `enqueueOncallOutbox(database, { shift, eventType, userId }, env)` — one `PENDING` row per
  selected channel of the technician in `notification_preferences`, the instance chain of §11.1
  when the user has no row; the row carries `shift_id`, `event_type`, `target`
- `drainOutbox` — a row with `shift_id` sends the readiness message, a row with `ticket_id` the
  ticket message

## Task

1. `packages/shared/src/schemas/notification.ts`: add `oncallShiftMessageSchema` and its type
   next to the preferences contracts of WP-M14-16.
2. `apps/api/src/notifications/outbox.ts`: add `enqueueOncallOutbox` that resolves the channels
   of the technician from `notification_preferences` (fallback: `configuredChannels`), maps
   `shift_id`, `event_type` and the readiness target and inserts the rows in the given
   transaction node; reuse the retry/backoff/`FAILED` machinery untouched.
3. In `drainOutbox` and `messageOf` branch on `shift_id`: build the readiness message
   (pool name, the start and end in `Europe/Berlin` formatted from the stored UTC values, the
   state, the deep link to `/oncall`) and never touch the ticket fields of §11.5.
4. `readiness-outbox.integration.spec.ts`: an `oncall.assigned` row for a technician with a
   selection of one channel is drained once through that channel, a technician without a row
   uses the instance chain, a shift row never answers ticket message fields and a second
   enqueue for the same shift and event is a no-op while the row is still `PENDING`.

## Non-goals

- No new channel kind and no adapter change.
- No enqueue in the on-call services — that is WP-M14-29.
- No UI and no i18n key: the readiness message keeps machine values, the labels of the deep link
  stay the existing `notification.action_label`.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the new spec fails before the change and passes after it.

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: WP-M14-29 (`29-readiness-allocation-enqueues-its-rows.md`)
- Open question: none
