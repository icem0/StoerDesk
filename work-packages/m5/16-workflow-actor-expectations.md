# WP-M5-16: workflow E2E expects the actor name, not the actor kind

format: small-model
status: done
depends-on: WP-M5-14, WP-M5-15
phase: 5
milestone: m5
context-budget: 10k tokens
spec: PLAN.md §3.1; work-packages/m5/15-history-actor-rendering.md
spec-lines: 15

files-read:

- apps/web/e2e/workflow.spec.ts
- apps/web/src/features/tickets/ticket-detail-page.tsx
- apps/api/src/db/seed-base.ts

files-write:

- apps/web/e2e/workflow.spec.ts
- work-packages/m5/16-workflow-actor-expectations.md

interfaces:

- the audit-trail E2E expects the bootstrap administrator's full name in all
  seven actor cells, matching WP-M5-14/WP-M5-15 (`actorName`, no `actorKind`).

## Task

WP-M5-14 filled `actorName` from given and family name and WP-M5-15 rendered only
that name. The workflow E2E still expected the old `actorKind` labels (`Nutzer` /
`User`), so both locales failed in CI.

1. Derive the expected actor name from `E2E_ADMIN_EMAIL` with the same rule as
   `deriveFamilyName` in `seed-base.ts`, so a local override keeps the test valid.
2. Replace the seven `actorKind.user` expectations with that name and drop the
   unused `actorKind` fixture.
3. Keep the "no raw `actorKind.` key" and event-order assertions untouched.

## Non-goals

- No product code or locale change.
- No new E2E scenario.

## Acceptance

```bash
npm run test:e2e
npm run typecheck --workspaces --if-present
npm run lint
npm run wp:check
```

Expected: all green; the E2E needs a browser and a throwaway database.

## Handoff

- Files changed: `apps/web/e2e/workflow.spec.ts`
- Interfaces added: none
- Verified: `npm run typecheck --workspaces --if-present`, `npm run lint` (0 errors, 7 pre-existing warnings), `npm run wp:check`; `npm run test:e2e` skipped locally (no Chromium), the CI run verifies it
- Follow-up WP: none
- Open question: none
