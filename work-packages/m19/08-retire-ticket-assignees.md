# WP-M19-08: retire the multi-technician table

format: small-model
status: done
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

- Files changed: apps/api/src/db/schema.ts (the table is gone),
  apps/api/src/db/migrations/0058_drop_ticket_assignees.sql,
  apps/api/src/tickets/detail.ts (the one `assignee`),
  apps/api/src/tickets/workflow.ts (no assignee row any more),
  apps/api/src/tickets/workflow-routes.ts (the targets of the picker),
  apps/web/src/features/tickets/ticket-detail-page.tsx (the one row),
  packages/shared/src/schemas/ticket.ts (the answer of the detail),
  specs/02-data-model.md §4.13, specs/07-escalation.md §7.14,
  docs/REPO-MAP.md,
  apps/api/src/db/__tests__/ticket-assignees-retired.integration.spec.ts (new),
  apps/api/src/tickets/__tests__/workflow-columns.integration.spec.ts,
  apps/api/src/escalation/__tests__/distribution.integration.spec.ts,
  apps/web/src/features/tickets/__tests__/ticket-detail-assignees.test.tsx,
  CHANGELOG.md, work-packages/README.md, this document
- Interfaces added: none — the answer of the detail carries the one `assignee`
  and the `assignmentStatus` instead of the list `assignees[]`
- Verified: `npm run typecheck --workspaces --if-present`, the integration spec
  of the retirement (the migration copies the technician of the latest row and
  drops the table on a database that still holds the old rows),
  `npm run wp:check` green
- Follow-up WP: none
- Open question: none
- Notes: the old rows are **migrated**, not dropped: the technician of the
  latest row of every ticket moves into `tickets.assigned_user_id`, so a ticket
  that was worked on keeps its name. The status of the assignment stays NULL —
  the former model knew no state, and the history of the assignments stays in
  the events of the ticket.
