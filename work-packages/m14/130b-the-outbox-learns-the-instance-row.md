# WP-M14-130b: the outbox table learns the instance row of the warning

format: small-model
status: planned
phase: 14
milestone: m14
context-budget: 16k tokens
spec: specs/10-notifications.md §11.15; PLAN.md §6, §12; ADR-0028
spec-lines: 14

depends-on: WP-M14-130, WP-M14-129a

files-read:

- apps/api/src/db/schema.ts (the `outbox` table and its checks)
- apps/api/src/db/migrations/0039_readiness_notifications.sql (the checks of the event type)
- apps/api/src/db/migrations/meta/_journal.json (the journal of the migrations)
- apps/api/src/db/__tests__/ticketTables.integration.spec.ts (the test pattern of a migration)

files-write:

- apps/api/src/db/migrations/0049_channel_health_warning.sql
- apps/api/src/db/schema.ts
- apps/api/src/db/migrations/meta/_journal.json

interfaces:

- The event type `channel.health_warning` — an instance row of the warning of
  §11.15; it belongs to no ticket and to no shift
- The check `outbox_event_type_check` names the eight types, the check
  `outbox_ticket_or_shift_check` allows the warning row without a ticket and
  without a shift

## Task

1. Add the migration `0049_channel_health_warning.sql`: it drops the check
   `outbox_event_type_check` and adds it again with the eighth type
   `channel.health_warning`, and it drops the check `outbox_ticket_or_shift_check`
   and adds it again — a row of the warning type may carry neither a ticket
   nor a shift, every other row keeps exactly one of the two.
2. In `apps/api/src/db/schema.ts`, name the new type next to
   `NOTIFICATION_EVENT_TYPES` as the instance type of the warning and widen the
   two checks of the `outbox` table the same way the migration does. The seven
   types of §11.4 stay the only types a user selects channels for.
3. Register the migration in the journal of the migrations folder — the
   Drizzle migrator reads the journal and applies only the migrations it
   names.
4. Add a test that proves a warning row is accepted and that a ticket row
   without a ticket and without a shift is still refused.

## Non-goals

- No new table, no new column, no personal message for the warning.
- No change of the seven event types of §11.4.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the migration applies and the check knows the warning row.

## Handoff

- Files changed: the migration, the schema and the journal
- Interfaces added: the event type `channel.health_warning`
- Verified: `npm run check`, `npm run build`
- Follow-up WP: WP-M14-130c (the daily check and the warning)
- Open question: none
