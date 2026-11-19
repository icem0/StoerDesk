# WP-M15-05: the duty windows satisfy their criterion

format: small-model
status: done
depends-on: WP-M15-04
phase: 15
milestone: m15
context-budget: 16k tokens
spec: specs/04-oncall.md §4a.3.2, §4a.6, §4a.9; PLAN.md §16 phase 15
spec-lines: 60

files-read:

- apps/api/src/oncall/coupling.ts (the resolution of the on-call person)
- apps/api/src/oncall/__tests__/coupling.integration.spec.ts (the helpers of the coupling)
- apps/api/src/oncall/service.ts (the generation of the shifts)
- specs/04-oncall.md (§4a.3.2, §4a.6, §4a.9)
- PLAN.md (§16 phase 15)

files-write:

- apps/api/src/oncall/__tests__/window-plan.integration.spec.ts
- specs/04-oncall.md (§4a.9 boundaries)
- PLAN.md (§16)
- work-packages/README.md

interfaces:

- the phase-15 exit criterion: a pool with office hours is expressible, every
  window is a shift of its own, and the coupling names the technician only
  inside a window
- `GET /api/v1/oncall/shifts` — the windows of a week beside the old shifts

## Task

1. The integration test `window-plan.integration.spec.ts` writes the windows of
   the office through the API (Monday to Thursday 07:30–17:00, Friday
   07:00–12:00), generates the shifts of a week and proves that the week holds
   exactly the five shifts with their times in `Europe/Berlin`.
2. The same test assigns a technician to the Monday shift and proves the
   coupling: a time inside the window names the technician, a time outside every
   window names nobody, so the offer of a ticket goes to the group (§4a.6).
3. `specs/04-oncall.md` §4a.9 names the boundary: the window plan creates new
   shifts and never changes the shifts that exist; the continuous plan stays
   the plan while no window is stored.
4. `PLAN.md` §16 records the closed phase and `work-packages/README.md` carries
   the state of the chain.

## Non-goals

- No deletion of the shifts of the continuous plan and no migration of them.
- No night window and no second window per weekday (§4a.3.2).
- No change of the acceptance script of `scripts/e2e-acceptance.mjs`: the
  integration test proves the criterion.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the new test fails before the change and passes after it.

## Handoff

- Files changed: the integration test file, `specs/04-oncall.md` §4a.9,
  `PLAN.md` §16, `work-packages/README.md`
- Interfaces added: the exit criterion above
- Verified: the commands above with a reachable Postgres
- Follow-up WP: none — phase 15 is closed
- Open question: none
