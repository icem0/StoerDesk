format: small-model
status: pending
depends-on: WP-M2-88b
phase: 2
context-budget: 10k tokens
spec: PLAN.md §6, PLAN.md §11
spec-lines: 30

files-read:

- apps/web/src/features/tickets/__tests__/report-form-page.test.tsx
- apps/api/src/db/seed-demo.ts

files-write:

- apps/web/src/features/tickets/__tests__/report-form-page.test.tsx
- apps/api/src/db/seed-demo.ts

interfaces:

- `report-form-page.test.tsx`: removes `systemId` from expected request bodies and system-related assertions.
- `seed-demo.ts`: demo objects are created without systems; no system rows inserted.

## Task

Update the report form test and the demo seed for the system-free model.

1. `report-form-page.test.tsx`: `systemId` is no longer part of `PublicReportRequest`; test bodies and assertions updated.
2. `seed-demo.ts`: three demo objects are created without `systems`; no `systems` insert calls.

## Non-goals

- No other test files affected.

## Acceptance

Run and report the exact commands:

```bash
npm run typecheck --workspaces --if-present
npm run test:run
npm run i18n:check
npm run wp:check
```

## Handoff

- Files changed: `apps/web/src/features/tickets/__tests__/report-form-page.test.tsx`, `apps/api/src/db/seed-demo.ts`
- Follow-up WP: none (feature complete)
- Open question: none
