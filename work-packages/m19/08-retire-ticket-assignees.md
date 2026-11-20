# WP-M19-08: retire the multi-technician table

format: small-model
status: planned
phase: 19
milestone: m19
context-budget: 14k tokens
depends-on: WP-M19-05, WP-M19-06
spec: docs/DECISIONS/0039-the-assignment-names-one-technician-and-its-status.md (Consequences); specs/02-data-model.md §4.13
spec-lines: 30

files-read:

- apps/api/src/tickets/detail.ts (the `assignees` answer)
- apps/web/src/features/tickets/ticket-detail-page.tsx (the `ticket-assignees` row)
- apps/api/src/escalation/distribution.ts (the old `ticket_assignees` write)

files-write:

- apps/api/src/db/schema.ts (remove `ticketAssignees`)
- apps/api/src/db/migrations/00NN_drop_ticket_assignees.sql (next free number)
- apps/api/src/tickets/detail.ts (answer `assignee` from `assigned_user_id`)
- apps/web/src/features/tickets/ticket-detail-page.tsx (single assignee row)

interfaces:

- ticket detail answer: `assignee: { id, name } | null` replaces `assignees[]`
- table `ticket_assignees` dropped

## Task

1. Confirm that no code path writes `ticket_assignees` any more (WP-M19-04 and -05).
2. Replace the list of assignees in the detail answer and in the web row with the
   single `assignee` from `assigned_user_id`.
3. Drop the table in a migration; the data is copied to `ticket_events` history
   only when rows exist (the events already hold the history).

## Non-goals

- No change of the workflow steps.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run test:run
npm run wp:check
```

Expected: detail tests show one assignee; the migration applies on a database that
holds old `ticket_assignees` rows.

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: none
- Open question: whether old rows should be migrated into `assigned_user_id` (the
  latest assignee) or dropped; decide before this WP starts.
