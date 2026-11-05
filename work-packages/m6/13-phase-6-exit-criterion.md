# WP-M6-13: phase-6 exit criterion and record

format: small-model
status: planned
depends-on: WP-M6-08, WP-M6-10, WP-M6-11
phase: 6
milestone: m6
context-budget: 20k tokens
spec: PLAN.md §16 phase 6 (exit criterion), §20 acceptance 6
spec-lines: 30

files-read:

- PLAN.md §16 phase 6, §20 acceptance 6
- apps/api/src/tickets/__tests__/escalation.integration.spec.ts
- apps/api/src/tickets/__tests__/detail.integration.spec.ts
- work-packages/README.md (backlog table)

files-write:

- apps/api/src/tickets/__tests__/escalation-exit.integration.spec.ts
- docs/REPO-MAP.md
- PLAN.md (§16 current state, §19 resolved decision)
- work-packages/README.md (backlog rows)

interfaces:

- test "overdue ticket escalates and appears in the history": an open ticket
  with a passed deadline runs `evaluateEscalations`, then
  `GET /api/v1/tickets/:ticketNo` returns exactly one `escalated` event with
  `rule = deadline_exceeded` and the timeline state `red`
- the same test proves a second run adds no event

## Task

1. Write the integration test against a throwaway database and the real API
   (the `internalActions.routes` sign-in pattern).
2. Assert the detail answer's event and timeline, not a direct table read only.
3. Update `docs/REPO-MAP.md` with the new modules; close the phase-6 rows in
   `work-packages/README.md` and update PLAN §16/§19.
4. Report the phase exit criterion as proven by the integration test.

## Non-goals

- No notification delivery (phase 7).
- No E2E browser test; the exit criterion is an API/history assertion.
- No new product code.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the integration test runs against PostgreSQL or skips with
a named reason.

## Handoff

- Files changed: exit test, repository map, PLAN §16/§19, backlog table
- Interfaces added: none; the test asserts the phase-6 contract
- Verified: typecheck, lint, test:run
- Follow-up WP: none — phase 6 closes; phase 7 (notifications) starts with its `m7` packages
- Open question: contract-type deadlines stay deferred (ADR-0008)
