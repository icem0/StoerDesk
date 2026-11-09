# WP-M8-16: phase-8 exit criterion and record

format: small-model
status: done
depends-on: WP-M8-02 … WP-M8-15
phase: 8
milestone: m8
context-budget: 20k tokens
spec: specs/04-oncall.md §4a.3.1, §4a.5; PLAN.md §16 phase 8, §20 item 12
spec-lines: 50

files-read:

- specs/04-oncall.md (§4a.3.1 DST slots, §4a.5 atomic acceptance)
- packages/shared/src/oncall.ts (`generateOncallSlots`)
- apps/api/src/oncall/swaps.ts (acceptance transaction)
- apps/api/src/db/__tests__/ticketTables.integration.spec.ts (database test setup)
- work-packages/README.md (backlog of record and record style)

files-write:

- apps/api/src/oncall/__tests__/phase8-exit.integration.spec.ts
- packages/shared/src/oncall.ts (process-time-zone independence exposed by the exit test)
- work-packages/README.md, PLAN.md §16, docs/REPO-MAP.md, CHANGELOG.md (record)

interfaces:

- the phase-8 exit test: DST slot lengths and exactly one winning swap acceptance
- the backlog and implementation-status record of phase 8

## Task

1. Add the phase-8 exit integration test. It proves the DST rule of §4a.3.1
   against `generateOncallSlots` (167 h in the March week, 169 h in the October
   week, 168 h for a neutral week) and the atomic swap rule of §4a.5: two
   acceptances for one `PENDING` request run concurrently and exactly one
   succeeds while the other gets `409 swap_taken`.
2. Assert the resulting shift carries the winner, the request is `ACCEPTED`
   (approval on) or `APPROVED` (approval off), and exactly one
   `swap_accepted` event exists.
3. Add the test to the database-backed suite; it skips with a named reason when
   `TEST_DATABASE_URL` is absent, like the other integration tests.
4. Mark WP-M8-01 … WP-M8-16 `done` in `work-packages/README.md`, add the
   phase-8 record to `PLAN.md` §16, update the implementation status of
   `docs/REPO-MAP.md` and add the entry to `CHANGELOG.md`.
5. Report the exit criterion result in the handoff; do not weaken any skipped
   gate.

## Non-goals

- No new product behaviour.
- No dashboard tile or statistics (phase 9).
- No notification channel change.
- No Docker gate: this phase has no Docker change.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the exit test runs against PostgreSQL or skips with a named
reason. The atomic test result `exactly one winner` is asserted, not inferred.

## Handoff

- Files changed: the phase-8 exit test, the time-zone independence fix in
  `generateOncallSlots` plus the backlog, plan, repo-map and changelog record
- Interfaces added: none (verification and record only)
- Verified: typecheck, lint, test:run, wp:check; the exit test ran against
  PostgreSQL (5/5) and exposed that `generateOncallSlots` produced wrong UTC
  instants when the process `TZ` was `Europe/Berlin` (the shipped `.env`);
  reading the zoned wall clock with local getters and `fromZonedTime` restores
  the 167/169/168-hour rule under any `TZ`
- Follow-up WP: none; phase 8 closes with this package
- Open question: none
