format: small-model
status: pending
depends-on: WP-M2-88a
phase: 2
context-budget: 10k tokens
spec: PLAN.md §6, PLAN.md §11
spec-lines: 30

files-read:

- apps/api/src/tickets/__tests__/report.integration.spec.ts
- apps/api/src/tickets/__tests__/duplicates.integration.spec.ts

files-write:

- apps/api/src/tickets/__tests__/report.integration.spec.ts
- apps/api/src/tickets/__tests__/duplicates.integration.spec.ts

interfaces:

- `report.integration.spec.ts`: removes `systemId` from report requests and foreign-system assertions.
- `duplicates.integration.spec.ts`: removes `systemId` from open-ticket queries and system-scoped duplicate assertions.

## Task

Update ticket integration tests that referenced `systemId`.

1. `report.integration.spec.ts`: public report no longer sends `systemId`; foreign system assertions removed.
2. `duplicates.integration.spec.ts`: `findOpenTickets` no longer takes `systemId`; duplicate tests use object-only scope.

## Non-goals

- No new tests added.

## Acceptance

Run and report the exact commands:

```bash
npm run typecheck --workspaces --if-present
npm run test:run
npm run wp:check
```

## Handoff

- Files changed: `apps/api/src/tickets/__tests__/report.integration.spec.ts`, `apps/api/src/tickets/__tests__/duplicates.integration.spec.ts`
- Follow-up WP: WP-M2-88c (Web test + seed)
- Open question: none
