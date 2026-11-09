# WP-M9-30: ticket API hardening (SEC-007/008/015/017/018/020)

format: small-model
status: done
depends-on: WP-M9-29
phase: 9
milestone: m9
context-budget: 18k tokens
spec: PLAN.md §15 (audit — SEC-007/008/015/017/018/020); specs/02-data-model.md §4.11 (ticket_no); specs/06-report-form.md §7.4 (photos); specs/07-ticket-workflow.md (declination reason)
spec-lines: 30

files-read:

- apps/api/src/tickets/workflow-routes.ts (decline guard, reason body)
- apps/api/src/tickets/delete-routes.ts (ticketNo param)
- apps/api/src/tickets/delete.ts (error params)
- apps/api/src/tickets/photos.ts (photo serve route)
- packages/shared/src/schemas/ticket.ts (ticketNoSchema from WP-M9-29)
- packages/shared/src/schemas/auth.ts (PERMISSIONS.ticket.photoRead)

files-write:

- apps/api/src/tickets/workflow-routes.ts
- apps/api/src/tickets/delete-routes.ts
- apps/api/src/tickets/delete.ts
- apps/api/src/tickets/photos.ts

interfaces:

- `ticketNoSchema` (from WP-M9-29) also validated on workflow/delete/photo routes → `400 invalid_request` fields `['ticketNo']`
- decline guarded by `PERMISSIONS.ticket.decline` instead of `ticket.accept`; `DECLINE_REASON` capped at 1000 characters
- photo serve guarded by `PERMISSIONS.ticket.photoRead`; resolved file path checked to stay under `UPLOAD_DIR`; answer carries `Cache-Control: private, no-store`
- `DeleteTicketError.failed` answers only `sqlState` plus a static detail; the raw PostgreSQL message is logged, not answered

## Task

1. `apps/api/src/tickets/workflow-routes.ts`: decline transition guarded by
   `ticket.decline` (not `ticket.accept`); `DECLINE_REASON` gains `.max(1000)`;
   `ticketNo` param validated before the lookup (`400 invalid_request`).
2. `apps/api/src/tickets/delete-routes.ts`: `ticketNo` param validated before
   the lookup (`400 invalid_request`).
3. `apps/api/src/tickets/delete.ts`: `DeleteTicketError.failed` no longer
   echoes `pgError.message`/`pgError.detail` to the client; raw text stays in
   the server log (`delete-routes.ts` already logs it).
4. `apps/api/src/tickets/photos.ts`: photo serve guarded by
   `ticket.photoRead`; `ticketNo` validated; resolved path checked against
   `uploadDir`; answer carries `cache-control: private, no-store`.

## Non-goals

- No migration, no schema change, no i18n change, no UI change.
- The public report photo path (report.ts) is not touched here (WP-M9-31).

## Acceptance

```bash
npm run check
```

Expected: green.

## Handoff

- Files changed: the four route/service files
- Interfaces added: none new (ticketNoSchema from WP-M9-29)
- Verified: `npm run check`
- Follow-up WP: WP-M9-31 (report photo validation before the transaction, SEC-014)
- Open question: none
