# WP-M14-27: The outbox and the preferences know the readiness

format: small-model
status: planned
depends-on: WP-M14-26
phase: 14
milestone: m14
context-budget: 18k tokens
spec: specs/10-notifications.md §11.4, §11.7, §11.10 (ADR-0021)
spec-lines: 60

files-read:

- apps/api/src/db/schema.ts (`outbox`, `notificationPreferences`, `NOTIFICATION_EVENT_TYPES`)
- apps/api/src/db/migrations/0033_notification_channel_config.sql (the hand-written pattern)
- apps/api/src/db/__tests__/oncallTables.integration.spec.ts (the table probe pattern)
- apps/api/src/notifications/__tests__/outbox.integration.spec.ts (the outbox test)

files-write:

- apps/api/src/db/migrations/0034_readiness_notifications.sql
- apps/api/src/db/schema.ts
- apps/api/src/db/__tests__/readinessNotificationTables.integration.spec.ts

interfaces:

- `outbox.event_type` — text, not null, default `ticket.created`, check over the seven types
- `outbox.shift_id` — nullable UUID FK to `oncall_shifts`, `ON DELETE CASCADE`
- `outbox.ticket_id` — nullable, with the check that exactly one of `ticket_id` and `shift_id` is set
- `notification_preferences.event_type` — check over the seven types of ADR-0021

## Task

1. Add the hand-written migration `0034_readiness_notifications.sql`: on `outbox` it drops the
   `NOT NULL` on `ticket_id` (the FK and its cascade stay), adds
   `event_type text NOT NULL DEFAULT 'ticket.created'` with the check over the seven types of
   `NOTIFICATION_EVENT_TYPES`, adds `shift_id uuid` with the cascade FK to `oncall_shifts` and
   the check `(ticket_id IS NOT NULL) <> (shift_id IS NOT NULL)`; on
   `notification_preferences` it replaces the four-type event check with the seven-type check.
   Existing rows keep `ticket.created`.
2. Declare the same shape in `apps/api/src/db/schema.ts`: `eventType`, `shiftId`, the two
   checks and the nullable `ticketId`; `NOTIFICATION_EVENT_TYPES` gains
   `oncall.assigned`, `oncall.swap_requested` and `oncall.unconfirmed_reminder`, so the check
   lists and the shared constant agree.
3. `readinessNotificationTables.integration.spec.ts` on a throwaway database: a row with only
   `ticket_id`, a row with only `shift_id` and a readiness event type are accepted, a row with
   both or with neither is refused, the default of `event_type` on a row written without it is
   `ticket.created` and a `notification_preferences` row with `oncall.assigned` passes the check.

## Non-goals

- No enqueue and no drain change — the shift row is used in WP-M14-28.
- No change of the adapters, of `notification_accounts` or of `notifications.minimum_channels`.
- No rename of an existing column and no rewrite of existing rows.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run -- apps/api/src/db/__tests__/readinessNotificationTables.integration.spec.ts
npm run wp:check
```

Expected: all green; the new spec fails before the change and passes after it.

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: WP-M14-28 (`28-readiness-message-and-outbox-shift-rows.md`)
- Open question: none
