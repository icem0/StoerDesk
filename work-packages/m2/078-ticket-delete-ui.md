format: small-model
status: planned
depends-on: WP-M2-77
phase: 4
context-budget: 14k tokens
spec: PLAN.md §7 rule 10, PLAN.md §14
spec-lines: 30

files-read:

- apps/web/src/features/tickets/ticket-detail-page.tsx
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json
- apps/web/src/lib/api.ts

files-write:

- apps/web/src/features/tickets/ticket-detail-page.tsx
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json

interfaces:

- UI action "detail.action.delete" = "Endgültig löschen" shown only for `ticket.status === 'CANCELLED'` and `usePermission('ticket.delete')`; confirms via `detail.prompt.deleteConfirm`, calls `DELETE /v1/tickets/:ticketNo` and navigates back to `/tickets`

## Task

Surface the permanent deletion on the ticket detail page (`WP-M2-18b`), exactly as the
user asked: first stornieren (WP-M2-19c `cancelled`), then — for admins — a
"Endgültig löschen" button.

1. `ticket-detail-page.tsx`: import `usePermission` from `../../auth/usePermission`; in
   the actions block, render the delete button only when
   `ticket.status === 'CANCELLED' && usePermission(PERMISSION...)` — use the string
   key `'ticket.delete'` directly (`usePermission` takes arbitrary keys). On click:
   `window.confirm(t('detail.prompt.deleteConfirm'))`, then
   `apiFetch<never>(\`/v1/tickets/${ticketNo}\`, { method: 'DELETE' })` and
   `navigate('/tickets')` on success.
2. Add `detail.action.delete` ("Endgültig löschen") and
   `detail.prompt.deleteConfirm` to both `ticket/de.json` and `ticket/en.json`.

## Non-goals

- No button in the ticket list.
- No undo/restore.
- No mandatory reason (decision of 2026-11-04: reason optional).

## Acceptance

Run and report the exact commands:

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected result: all green; `npm run i18n:check` reports equal key counts in de/en.

## Handoff

- Files changed: `apps/web/src/features/tickets/ticket-detail-page.tsx`,
  `apps/web/src/i18n/locales/de/ticket.json`,
  `apps/web/src/i18n/locales/en/ticket.json`
- Interfaces added: delete button + DELETE call on the detail page
- Verified: typecheck, lint, vitest, i18n:check, `npm run wp:check`
- Follow-up WP: none (feature complete)
- Open question: none
