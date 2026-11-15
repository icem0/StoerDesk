# WP-M14-61: The seed carries the stage chain

format: small-model
status: done
depends-on: WP-M14-59, WP-M14-60
phase: 14
context-budget: 16k tokens
spec: specs/07-escalation.md §7.2, §7.11; PLAN.md §9
spec-lines: 80

files-read:

- apps/api/src/db/seed-escalation.ts
- apps/api/src/db/schema.ts (`escalationStages`)
- packages/shared/src/schemas/escalation-config.ts (`DEFAULT_WORKFLOW_ESCALATION_STAGES`)
- apps/api/src/db/__tests__/seed-escalation.integration.spec.ts

files-write:

- apps/api/src/db/seed-escalation.ts
- apps/api/src/db/__tests__/seed-escalation.integration.spec.ts

interfaces:

- `seedEscalation(database)` — inserts `predecessor` and `reached_by` with every stage row

## Task

1. `seedEscalation`: the stage insert carries `predecessor` and `reachedBy` of
   `DEFAULT_WORKFLOW_ESCALATION_STAGES` (the chain of §7.1 and §7.11). The
   idempotency rule stays: an existing row is never overwritten.
2. The rule seed is unchanged: the five default rules keep their explicit
   `reference`, which matches the clock of their stage (§7.11).
3. Extend the integration spec on a throwaway database: exactly five stage rows,
   `review` with a `null` predecessor, every other stage naming its predecessor,
   `work_order.reached_by` equal to `["work_order_set"]`; a second seed run
   reports `existing` and writes nothing.

## Non-goals

- No route, engine or UI change.
- No legacy-minutes takeover change (the settings rows of WP-M13-04 stay).
- No installation of a stage beyond the default chain in the seed.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; with `TEST_DATABASE_URL` the seed spec asserts the chain,
without it the spec is reported unverified (`PLAN.md` §18).

## Handoff

- Files changed: `apps/api/src/db/seed-escalation.ts`, `apps/api/src/db/__tests__/seed-escalation.integration.spec.ts`
- Interfaces added: `seedEscalation` writes `predecessor` and `reached_by` with every stage row
- Verified: `npm run typecheck -w @stoerdesk/api` and ESLint; the integration spec needs `TEST_DATABASE_URL` and is unverified in this container
- Follow-up WP: WP-M14-62 (the stage-set API)
- Open question: none
