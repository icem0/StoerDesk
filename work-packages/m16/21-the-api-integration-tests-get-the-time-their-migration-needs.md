# WP-M16-21: the API integration tests get the time their migration needs

format: small-model
status: done
depends-on: WP-M16-20d
phase: 16
milestone: m16
context-budget: 10k tokens
spec: PLAN.md §18.1, §18.2; specs/15-work-packages.md
spec-lines: 20

files-read:

- apps/api/vitest.config.ts (the project configuration of the API tests)
- apps/api/src/db/__tests__/helpers/testDatabase.ts (the throwaway database of a
  test file and its migration in the hook)
- apps/api/src/stats/__tests__/statsExport.integration.spec.ts (the file that
  failed in the run v1.2.37)
- .github/workflows/check.yml (the runner of the gate)

files-write:

- apps/api/vitest.config.ts (the timeout of the hook)
- work-packages/m16/21-the-api-integration-tests-get-the-time-their-migration-needs.md
  (this document) and work-packages/README.md (the backlog row)
- CHANGELOG.md

interfaces:

- the `hookTimeout` of the API project — 60 seconds for the `beforeAll` hook
  that creates the throwaway database and migrates it; the assertions keep
  their own timeout

## Task

1. The check run of the version **v1.2.37** (WP-M16-16) failed although the
   commit changed only the web app: the file
   `apps/api/src/stats/__tests__/statsExport.integration.spec.ts` reported
   "Hook timed out in 10000ms" in its `beforeAll` — the hook creates the
   throwaway database and migrates it — and the assertion behind it then found
   no client. The file passes in three seconds when it runs alone and the
   neighbouring runs (v1.2.36, v1.2.38 … v1.2.45) are green; the runner of the
   gate has two cores, and the migrations of the parallel files compete for the
   same PostgreSQL instance, so the last of them needs more than the ten
   seconds of the default hook timeout.
2. `apps/api/vitest.config.ts` gives the hook of the API project a minute
   (`hookTimeout: 60_000`). The assertions keep their own timeout and stay as
   strict as they are — no test is skipped, no assertion is weakened and the
   timeout of the tests themselves is untouched.
3. The comment of the configuration names the cause and the version, so the
   next reader knows why the number is there.
4. `work-packages/README.md` carries the row of this work package and
   `CHANGELOG.md` the note.

## Non-goals

- No change of an assertion, of a test and of the API itself.
- No change of the timeout of the tests — only of the hook that prepares the
  database.
- No change of the CI workflow and no new job.
- No change of the web project and of the shared package.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the API integration tests finish without a hook timeout
under the parallel load of the gate.

## Handoff

- Files changed: `apps/api/vitest.config.ts`, this document, the backlog row of
  `work-packages/README.md`, `CHANGELOG.md`
- Interfaces added: the `hookTimeout` of the API project
- Verified: the commands above; the check run of the new version proves the
  gate
- Follow-up WP: none
- Open question: none
