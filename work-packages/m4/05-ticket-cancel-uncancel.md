# WP-M4-05: Ticket cancel, un-cancel and hard-delete for cancelled tickets

format: small-model
status: done
depends-on: WP-M2-19b, WP-M2-77, WP-M2-78
phase: 4
context-budget: 18k tokens
spec: PLAN.md §7
spec-lines: 20

files-read:

- apps/api/src/tickets/workflow.ts
- apps/api/src/tickets/workflow-routes.ts
- apps/api/src/tickets/delete-routes.ts
- apps/web/src/features/tickets/ticket-detail-page.tsx
- apps/web/src/i18n/locales/{de,en}/ticket.json

files-write:

- apps/api/src/tickets/workflow.ts — `CANCELLED` → `uncancelled` → `NEW` transition
- apps/api/src/tickets/workflow-routes.ts and delete-routes.ts — `POST /api/v1/tickets/:ticketNo/uncancel`; accept missing DELETE body
- apps/web/src/features/tickets/ticket-detail-page.tsx — un-cancel button for CANCELLED tickets
- apps/web/src/i18n/locales/{de,en}/ticket.json — de/en keys for un-cancel

interfaces:

- `transitionTicket({ event: 'uncancelled', ... })` — writes `uncancelled` event, moves `CANCELLED` → `NEW`
- `POST /api/v1/tickets/:ticketNo/uncancel` — guarded by `ticket.cancel`, requires `reason` (min 5 chars)
- `DELETE /api/v1/tickets/:ticketNo` — hard-deletes a `CANCELLED` ticket, writes `ticket_purges` row

## Task

1. Add `CANCELLED: { uncancelled: { to: 'NEW' } }` to the state machine in `workflow.ts` so a cancelled ticket can be restored to `NEW`; the `uncancelled` event is appended to `ticket_events` in the same transaction (logged).
2. Add `POST /api/v1/tickets/:ticketNo/uncancel` route in `workflow-routes.ts`, guarded by `ticket.cancel`, with a `reason` body (min 5 chars).
3. Fix `delete-routes.ts` to accept a missing request body on `DELETE /api/v1/tickets/:ticketNo` (the UI sends no body; `z.object().safeParse(undefined)` returned 400 and the delete broke).
4. Add an un-cancel button to the ticket detail page for `CANCELLED` tickets, alongside the existing "Endgültig löschen" delete button.
5. Add i18n keys (`status.events.uncancelled`, `detail.action.uncancel`, `detail.prompt.uncancelReason`) in `de` and `en`.

## Non-goals

- No new permission key: un-cancel reuses `ticket.cancel` (office + admin already hold it).
- No public status-page visibility for `uncancelled` (it is not in `PUBLIC_TICKET_EVENT_TYPES`).
- No schema or migration changes (`CANCELLED` status and `ticket_events` already exist).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npx vitest run
npm run i18n:check
npm run wp:check
npm run build
```

Expected result: all green.

## Handoff

- Files changed: `apps/api/src/tickets/workflow.ts`, `apps/api/src/tickets/workflow-routes.ts`, `apps/api/src/tickets/delete-routes.ts`, `apps/web/src/features/tickets/ticket-detail-page.tsx`, `apps/web/src/i18n/locales/de/ticket.json`, `apps/web/src/i18n/locales/en/ticket.json`
- Interfaces added: `uncancelled` transition (`CANCELLED` → `NEW`), `POST /api/v1/tickets/:ticketNo/uncancel`
- Verified: `npm run check` and `npm run build` green (typecheck, lint, 472 vitest tests, i18n parity 616/616, wp:check 207/207, build ok)
- Follow-up WP: none
- Open question: none
