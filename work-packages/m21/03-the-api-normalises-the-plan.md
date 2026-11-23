# WP-M21-03: the API reads and writes the normalised plan

format: small-model
status: done
depends-on: WP-M21-02
phase: 21
milestone: m21
context-budget: 15k tokens
spec: specs/04-oncall.md §4a.3.4
spec-lines: 30

files-read:

- apps/api/src/oncall/pools.ts (the plan of the pool in the answer and in the write)
- apps/api/src/oncall/service.ts (the generation of the blocks)
- apps/api/src/oncall/__tests__/service.integration.spec.ts (the generation test)
- packages/shared/src/oncall.ts (`mergeOncallBlocks`)

files-write:

- apps/api/src/oncall/pools.ts
- apps/api/src/oncall/service.ts
- apps/api/src/oncall/__tests__/service.integration.spec.ts

interfaces:

- `GET /api/v1/oncall/pools` — the plan of a pool in the answer is normalised
- `PATCH /api/v1/oncall/pools/:id` — the stored plan is normalised
- `POST /api/v1/oncall/shifts/generate` — the generated blocks are normalised

## Task

1. In `apps/api/src/oncall/pools.ts` the plan of a pool in the answer and in
   the write is normalised with `mergeOncallBlocks` — the stored plan of a pool
   of the older version becomes blocks without a migration.
2. In `apps/api/src/oncall/service.ts` the generator reads the normalised
   blocks, so a pool with the plan of Monday to Friday creates one shift per
   week instead of five.
3. The write path stores the normalised plan; the plan without blocks stays
   empty and the pool keeps the continuous plan.
4. Test: a pool with five day windows (Monday to Thursday 07:30–17:00, Friday
   07:00–12:00) answers two blocks and the generation creates two shifts a
   week; the second generation skips them (idempotent).

## Non-goals

- No migration, no change of the shift model.
- No deletion of the shifts of the older plan (the admin deletes them).
- No UI (WP-M21-04).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the new test fails before the change and passes after it.

## Handoff

- Files changed: the pool routes, the shift service and their test
- Interfaces added: none (the shared normalisation of WP-M21-02)
- Verified: the commands above
- Follow-up WP: WP-M21-04
- Open question: none
