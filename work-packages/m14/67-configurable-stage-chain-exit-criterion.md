# WP-M14-67: The configurable stage chain satisfies its criterion

format: small-model
status: done
depends-on: WP-M14-59, WP-M14-60, WP-M14-61, WP-M14-62, WP-M14-63, WP-M14-64, WP-M14-65, WP-M14-66
phase: 14
context-budget: 24k tokens
spec: specs/07-escalation.md §7.11, §7.12; PLAN.md §16 phase 14 exit criteria
spec-lines: 120

files-read:

- apps/api/src/escalation/__tests__/phase13-exit.integration.spec.ts (the pattern)
- apps/api/src/escalation/config.ts, apps/api/src/tickets/escalation.ts
- apps/api/src/db/seed-escalation.ts
- scripts/e2e-acceptance.mjs

files-write:

- apps/api/src/escalation/__tests__/stage-chain-exit.integration.spec.ts

interfaces:

- `evaluateTicketEscalations(database, ticketId)` on a modified stage chain
- the phase exit assertion of the configurable stage chain

## Task

1. On a throwaway database (migrated and seeded): add the stage
   `night_review` between `review` and `work_order` with one
   `PUT /api/v1/escalation/stages` and a rule of that stage.
2. Assert the chain: `night_review.predecessor` is `review`, the following
   `work_order` was re-pointed to `night_review`, the set is valid and
   `position` order is consistent.
3. Assert the clock: a ticket that reached `review` but not `work_order`
   escalates once for the rule of `night_review` after its deadline; the firing
   row exists exactly once (`escalation_firings`).
4. Assert the removal: a second `PUT` without `night_review` and its rule
   deletes both; the escalation events and firing rows of the removed stage stay
   readable in the history.
5. Assert the ticket view: `GET /api/v1/tickets/:ticketNo` answers
   `availableStages` only for the stages whose `reached_by` the transition map
   allows.
6. Run the phase-13 exit test alongside: the default chain still satisfies its
   criteria, so the configurable set does not change the defaults.

## Non-goals

- No new product code; the package only proves the chain.
- No acceptance-suite item of §20 is closed by this package.
- No Docker work; the smoke run belongs to CI.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
npm run check
```

Expected: all green; the new spec fails before the chain packages and passes
after them; without `TEST_DATABASE_URL` the spec is reported unverified, never
green (`PLAN.md` §18).

## Handoff

- Files changed: `apps/api/src/escalation/__tests__/stage-chain-exit.integration.spec.ts`, `apps/api/src/tickets/__tests__/escalation.integration.spec.ts` (fixture reaches every stage so the deadline test stays isolated)
- Interfaces added: four integration tests prove the added intermediate stage, its rule clock, the unique firing row, the ticket view, the cascade on removal and the surviving audit rows
- Verified: `npx vitest run apps/api/src/escalation/__tests__/stage-chain-exit.integration.spec.ts apps/api/src/escalation/__tests__/phase13-exit.integration.spec.ts apps/api/src/escalation/__tests__/config-routes.integration.spec.ts` (17 tests), typecheck and ESLint
- Follow-up WP: none — the chain is closed; the phase-14 exit criterion WP-M14-21
  stays the closing package of the messenger-channel line
- Open question: none
