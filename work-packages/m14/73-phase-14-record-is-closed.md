# WP-M14-73: The phase-14 record is closed

format: small-model
status: done
depends-on: WP-M14-72b
phase: 14
milestone: m14
context-budget: 16k tokens
spec: PLAN.md §16 (phase roadmap), work-packages/README.md (the backlog of record), AGENTS.md (_Open follow-ups_)
spec-lines: 80

files-read:

- work-packages/README.md (the phase table, the status prose and the backlog table)
- PLAN.md §16 (the roadmap table and the status prose of the phases)
- work-packages/m14/23-escalation-administration-fully-localized.md … 26-readiness-allocation-announces-itself-spec-and-split.md (the stale `status` fields)
- docs/REPO-MAP.md (the implementation status at the end of the map)
- docs/DECISIONS.md (the ADR index of the phase)

files-write:

- work-packages/m14/ (the `status` fields of WP-M14-23 … WP-M14-26 and this document)
- PLAN.md (§16 — the closure paragraph of phase 14)
- work-packages/README.md (the phase row, the status prose and the backlog row of this package)
- CHANGELOG.md (the closure entry)

interfaces:

- `work-packages/m14/*.md` — the `status` field of every phase-14 document reads `done`
- `PLAN.md` §16 — the status prose names phase 14 as closed
- `work-packages/README.md` — the backlog row of WP-M14-73 and the closed phase row

## Task

1. The four phase-14 documents **WP-M14-23 … WP-M14-26** still carry
   `status: planned`, although their packages are implemented (the commits
   `604e9d8`, `8e7c9cf`, `4316b58` and `6f8a93b`) and the backlog table of
   `work-packages/README.md` already marks them as `done`. Set the field to
   `done` and complete the empty `Verified:` line of the handoff of WP-M14-26.
2. `PLAN.md` §16 gets the closure paragraph of the phase: every package of phase
   14 is implemented, the two exit criteria (WP-M14-21 and WP-M14-67) are proven
   by their integration tests, no follow-up is open and the phase is closed.
3. `work-packages/README.md`: the phase row of the table names the closed phase
   with the correct number of packages, the status prose ends with the closure
   statement and the backlog table gets the row of WP-M14-73.
4. `CHANGELOG.md`: one entry under `## [Unreleased]` that names the closed phase
   and the state of the record.
5. Repository bookkeeping outside `files-write` (`AGENTS.md`, _Work package
   discipline_): `docs/REPO-MAP.md` ends with "Phase 14 complete" instead of
   "Phase 14 has started (WP-M14-01)".

## Non-goals

- No code, schema, migration, route, UI or test change — the packages of the
  phase are implemented and their exit criteria are proven.
- No new package of the phase: the phase is closed, the next phase starts with
  its own split.
- No change of the specifications, the ADRs or the open decisions of `PLAN.md`
  §19 — they are settled for phase 14.

## Acceptance

```bash
npm run wp:check
npm run i18n:check
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run -- --maxWorkers=6
```

Expected: all green; `wp:check` reports the new document valid, the phase-14
documents carry `status: done` and the whole suite passes.

## Handoff

- Files changed: the four phase-14 documents with the stale status, this
  document, `PLAN.md` §16, `work-packages/README.md`, `CHANGELOG.md`,
  `docs/REPO-MAP.md`
- Interfaces added: none — a record change
- Verified: `npm run wp:check` (477 small-model packages, 0 failed),
  `npm run i18n:check` (1545 keys in de and en), typecheck, lint (0 errors),
  `npm run test:run -- --maxWorkers=6` green — 194 files, 1302 tests
- Follow-up WP: none — phase 14 is closed
- Open question: none
