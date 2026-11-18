# WP-M14-134i: the create form starts from the priority of the object

format: small-model
status: planned
phase: 14
milestone: m14
context-budget: 16k tokens
spec: specs/06-report-form.md §7.2; ADR-0029
spec-lines: 15

depends-on: WP-M14-134h

files-read:

- apps/web/src/features/tickets/internal-create-page.tsx (the internal form)
- apps/web/src/i18n/locales/de/ticket.json (the labels of the internal form)
- apps/web/src/features/tickets/__tests__/ (the pattern of the page tests)
- packages/shared/src/schemas/object.ts (the summary with the effective priority)

files-write:

- apps/web/src/features/tickets/internal-create-page.tsx

interfaces:

- The internal form preselects the effective priority of the picked object

## Task

1. In `apps/web/src/features/tickets/internal-create-page.tsx`, the option list
   of the object carries the effective priority of the object — the summary of
   the object list answers it since WP-M14-134c.
2. When the user picks an object, the select of the priority takes the priority
   of that object. The user may still choose another one — the explicit choice
   wins (ADR-0029, decision 5). Picking another object takes the priority of
   that object again.
3. Add a page test: picking an object with the priority `critical` shows
   `critical` in the select of the priority.

## Non-goals

- No change of the priority of the ticket of an existing report.
- No change of the QR form — the server resolves its priority (WP-M14-134e).
- No priority in the object list of the administration.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the internal form starts from the priority of the object.

## Handoff

- Files changed: the internal create form
- Interfaces added: the preselection of the priority of the picked object
- Verified: `npm run check` (exit 0), the page test of the internal form
- Follow-up WP: none — the chain of ADR-0029 is closed
- Open question: none
