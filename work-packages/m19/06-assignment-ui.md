# WP-M19-06: the picker of the ticket view and the pool editor

format: small-model
status: done
phase: 19
milestone: m19
context-budget: 20k tokens
depends-on: WP-M19-05
spec: specs/07-escalation.md §7.14 (The assign action); specs/13-ui.md
spec-lines: 40

files-read:

- apps/web/src/admin/escalation-action-editor.tsx (the target editor)
- apps/web/src/features/tickets/ticket-detail-page.tsx (the workflow buttons and the assignee row)
- apps/web/src/i18n/locales/de/ticket.json, en/ticket.json

files-write:

- apps/web/src/admin/escalation-action-editor.tsx (mode and acceptance for `assign`)
- apps/web/src/features/tickets/ticket-detail-page.tsx (the _Zuweisen_ picker and the answer buttons)
- apps/web/src/i18n/locales/de/ticket.json, apps/web/src/i18n/locales/en/ticket.json
- apps/web/src/admin/escalation-assignee-pool.tsx (new: the ordered pool editor)

interfaces:

- the picker lists the assignee pool; empty pool lists every active user
- the _Annahme erforderlich_ checkbox, default on
- the ticket view shows the status with its localized label (`offered`, `accepted`, `declined`)

## Task

1. The action editor shows `assign` with the modes _Aus Pool_ and _Fester Techniker_,
   no pool or group selection for `assign`. This fixes the defect that the editor
   defaulted to a pool.
2. The ticket view gets _Zuweisen_ with a picker and the buttons _Annehmen_ and
   _Ablehnen_ for the assigned technician.
3. The escalation settings get the ordered pool editor (up and down, add, remove).

## Non-goals

- No API change (WP-M19-03, WP-M19-05 deliver it).
- No notification text (WP-M19-07).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: component tests for the picker, the status label and the pool order;
`i18n:check` green in de and en.

## Handoff

- Files changed: apps/web/src/features/tickets/ticket-detail-page.tsx,
  apps/web/src/admin/escalation-assignee-pool.tsx (new),
  apps/web/src/admin/escalation-page.tsx (the tab of the pool),
  apps/web/src/i18n/locales/{de,en}/ticket.json,
  apps/web/src/i18n/locales/{de,en}/settings.json,
  packages/shared/src/schemas/ticket.ts (the answer of the detail),
  apps/api/src/tickets/detail.ts (the answer of the detail),
  apps/web/src/features/tickets/__tests__/ticket-detail-assign.test.tsx,
  apps/web/src/features/tickets/__tests__/ticket-detail-assignment.test.tsx (new),
  apps/web/src/admin/__tests__/escalation-assignee-pool.test.tsx (new),
  CHANGELOG.md, work-packages/README.md, this document
- Interfaces added: the picker of the assignment (the pool of the office, with
  every active user as the fallback of an empty pool), the flag _Annahme
  erforderlich_, the status label of the assignment, the buttons _Annehmen_ and
  _Ablehnen_, the ordered pool editor
- Verified: `npm run typecheck --workspaces --if-present`, the component tests
  of the picker, of the status label and of the order of the pool,
  `npm run i18n:check` and `npm run wp:check` green
- Follow-up WP: none
- Open question: none
- Notes: the editor of the actions (the mode of the `assign` action) came with
  WP-M19-05 — the contract of the action changed there and the administration
  would otherwise have sent a body the server refuses. The detail answer
  carries the technician and the status of the assignment (`assignee`,
  `assignmentStatus`); the old list of the technicians (`assignees[]`) is
  retired with the table in WP-M19-08. The empty pool offers every active
  user — the office asked for it in the phase of the specification.
