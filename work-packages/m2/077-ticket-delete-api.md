format: small-model
status: planned
depends-on: WP-M2-76
phase: 4
context-budget: 18k tokens
spec: PLAN.md §7 rule 10
spec-lines: 25

files-read:

- apps/api/src/tickets/workflow.ts
- apps/api/src/tickets/detail.ts
- apps/api/src/tickets/photos.ts
- apps/api/src/index.ts
- apps/api/src/db/schema.ts

files-write:

- apps/api/src/tickets/delete.ts (new)
- apps/api/src/tickets/delete-routes.ts (new)
- apps/api/src/index.ts (route registration)

interfaces:

- `deleteTicket({ database, uploadDir, ticketNo, actorUserId, reason }): Promise<{ ticketNo, objectNo, deletedEventsCount, deletedPhotosCount }>`
- `DELETE /api/v1/tickets/:ticketNo` guarded by `ticket.delete`, optional body `{ reason }`, 200 on success, 409 `ticket_not_cancelled`, 404 `ticket_not_found`

## Task

Permanently delete a ticket — only after it has been cancelled, only for
admins (`ticket.delete`, WP-M2-75), with the purge log of WP-M2-76 as the
accountability record.

1. `apps/api/src/tickets/delete.ts`: `deleteTicket()` loads the ticket by
   `ticket_no`; 404 `ticket_not_found` when missing; 409 `ticket_not_cancelled`
   when `status !== 'CANCELLED'`; inside one transaction counts events and photo
   rows (collecting the relative photo file paths), deletes the ticket row
   (cascade removes `ticket_events` and `ticket_photos` rows — permitted by the
   trigger of migration 0004), and inserts one `ticket_purges` row. After commit
   it removes `<UPLOAD_DIR>/tickets/<ticketId>/*` from the uploads volume and
   logs a warning (never fails) if a file is missing.
2. `apps/api/src/tickets/delete-routes.ts`: `DELETE /api/v1/tickets/:ticketNo`
   with `requirePermission(database, PERMISSIONS.ticket.delete)` and an optional
   Zod body `{ reason?: string }` (max 1000 chars).
3. Register `deleteRoutes` in `apps/api/src/index.ts` next to `workflowRoutes`.

## Non-goals

- No UI (WP-M2-78).
- No soft-delete, no restore.
- Reason is optional per the decision of 2026-11-04.

## Acceptance

Run and report the exact commands:

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected result: all green.

## Handoff

- Files changed: `apps/api/src/tickets/delete.ts`, `apps/api/src/tickets/delete-routes.ts`,
  `apps/api/src/index.ts`
- Interfaces added: `deleteTicket()`, `DELETE /api/v1/tickets/:ticketNo`
- Verified: typecheck, lint, vitest, `npm run wp:check`
- Follow-up WP: WP-M2-78 `078-ticket-delete-ui.md` (created in the same commit
  as this WP file)
- Open question: none
