# WP-M4-06: Ticket detail cancel menu instead of always-visible fields

format: small-model
status: planned
depends-on: WP-M4-05, WP-M2-91, WP-M2-78
phase: 4
context-budget: 18k tokens
spec: PLAN.md §7, §14
spec-lines: 30

files-read:

- apps/web/src/features/tickets/ticket-detail-page.tsx
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json

files-write:

- apps/web/src/features/tickets/ticket-detail-page.tsx — replace always-visible cancel/uncancel/delete fields with a single openable menu + conditional confirmation panel
- apps/web/src/i18n/locales/de/ticket.json — add detail.action.choose/confirm/abort and detail.menu.cancel/uncancel/delete
- apps/web/src/i18n/locales/en/ticket.json — same keys in English

interfaces:

- no API change; `POST /cancel`, `POST /uncancel`, `DELETE /:ticketNo` guards unchanged

## Task

1. Add `selectedAction` state to `TicketDetailPage`.
2. Replace the always-rendered `cancelReason` + "Stornieren" block (every status) and the `CANCELLED` block (`uncancelReason` + "Stornierung aufheben", `deleteConfirm` + "Endgültig löschen") with one `<select>` menu that is always shown but opens only on interaction.
3. Menu entries depend on status: non-`CANCELLED` shows "Stornieren"; `CANCELLED` shows "Stornierung aufheben" and, for `ticket.delete` holders, "Endgültig löschen".
4. Choosing an entry reveals only its confirmation field + "Bestätigen"/"Abbrecher"; "Abbrecher" resets the choice. No fields block the view by default.
5. Add i18n keys (`detail.action.choose`, `detail.action.confirm`, `detail.action.abort`, `detail.menu.cancel`, `detail.menu.uncancel`, `detail.menu.delete`) in `de` and `en`; keep existing `detail.prompt.*` keys.

## Non-goals

- No API, schema, migration or permission change.
- No new permission key (`ticket.cancel`, `ticket.delete` guards stay).
- No status-page change.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npx vitest run
npm run i18n:check
npm run wp:check
npm run build
```

Expected: all green. A cancelled ticket shows no permanent input fields; only after opening the menu does "Endgültig löschen" appear, and only for cancelled tickets.

## Handoff

- Files changed: `apps/web/src/features/tickets/ticket-detail-page.tsx`, `apps/web/src/i18n/locales/de/ticket.json`, `apps/web/src/i18n/locales/en/ticket.json`
- Interfaces added: none (UI rework only)
- Verified:
- Follow-up WP: none
- Open question: none
