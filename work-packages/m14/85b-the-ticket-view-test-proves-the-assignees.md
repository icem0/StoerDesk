# WP-M14-85b: the ticket view test proves the assignees

format: small-model
status: done
depends-on: WP-M14-85
phase: 14
milestone: m14
context-budget: 10k tokens
spec: specs/07-escalation.md §7.14
spec-lines: 30

files-read:

- apps/web/src/features/tickets/ticket-detail-page.tsx (the assignee row of WP-M14-85)
- apps/api/src/tickets/detail.ts (`assignees` in the answer)
- packages/shared/src/schemas/ticket.ts (`assignees` in the contract)
- apps/web/src/features/tickets/__tests__/ticket-detail-header-actions.test.tsx (the harness of a detail page test)

files-write:

- apps/web/src/features/tickets/__tests__/ticket-detail-assignees.test.tsx

interfaces:

- the detail page test proves the names of the assignees and the empty case

## Task

1. `apps/web/src/features/tickets/__tests__/ticket-detail-assignees.test.tsx`
   (new): render the ticket detail page with a mocked answer that carries two
   assignees — the view names both technicians — and with an answer whose
   `assignees` list is empty — the view shows no assignee row.

## Non-goals

- No change of the view, the contract or the answer (WP-M14-85).
- No contact value of a technician in the view or the answer.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the new test passes.

## Handoff

- Files changed: the new detail page test
- Interfaces added: none
- Verified: vitest (the new detail page test 3/3 — two technicians named, the
  empty case, no contact value), typecheck, ESLint, `npm run wp:check`
- Follow-up WP: none — the feature of the office is closed
- Open question: the per-user routing of the channels other than ntfy stays a
  named limitation of ADR-0026
