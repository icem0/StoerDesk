# WP-M10-18: Phase-10 exit criterion and record

format: small-model
status: planned
depends-on: WP-M10-17
phase: 10
milestone: m10
context-budget: 20k tokens
spec: PLAN.md §16 phase 10, §20; specs/08-objects-api.md §9.5; specs/14-nfr.md §15.3
spec-lines: 80

files-read:

- PLAN.md (§16 phase 10, §20)
- specs/08-objects-api.md (§9.4, §9.5)
- specs/14-nfr.md (§15.2, §15.3)
- apps/api/src/__tests__/ or the existing phase-exit test location

files-write:

- apps/api/src/__tests__/phase10-exit.integration.spec.ts
- PLAN.md §16, work-packages/README.md, CHANGELOG.md, docs/REPO-MAP.md

interfaces:

- API contract test: key → object upsert → ticket creation → webhook delivery
- restore drill reference

## Task

1. Add an integration test that mints an API key, calls the external object and
   ticket API, observes the webhook signature/retry, and checks the CSV import
   and privacy erasure paths.
2. Prove the restore drill is wired into the Docker smoke test; report a local
   skip as unverified.
3. Record phase 10 in `PLAN.md` §16, the backlog table, `CHANGELOG.md` and
   `docs/REPO-MAP.md`.
4. Report skipped gates honestly.

## Non-goals

- No new feature code.
- No new phase.

## Acceptance

```bash
npm run wp:check
npm run check
```

Expected: `check` green; the phase-10 exit test passes with a reachable
PostgreSQL and the Docker drill is green in CI.

## Handoff

- Files changed: the exit test and the four record files
- Interfaces added: none
- Verified: the commands above; Docker drill via CI
- Follow-up WP: none; phase 10 closes with this package
- Open question: none
