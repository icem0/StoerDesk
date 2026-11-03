# WP-M2-51: the update agent service core

format: small-model
status: implemented
depends-on: WP-M2-50
phase: 2
context-budget: 16k tokens
spec: specs/18-self-update.md §18.4, docs/DECISIONS/0006-host-update-agent.md
spec-lines: 130

files-read:

- docs/DECISIONS/0006-host-update-agent.md — the topology and the run steps
- apps/api/src/config/env.ts — the environment style of the repository
- packages/shared/src/schemas/index.ts — the schema barrel
- apps/api/src/db/schema.ts — the status lists of the run tables
- package.json, tsconfig.base.json — the workspace conventions

files-write:

- apps/agent/package.json
- apps/agent/tsconfig.json
- apps/agent/vitest.config.ts
- apps/agent/src/update-runner.ts

interfaces:

- `UpdateRunner` in `@stoerdesk/agent`: starts one host update
  (`git pull` → `docker compose up -d --build` → `docker image prune -f`) and
  reports the steps, the versions and the error code
- run states `idle` | `running` | `failed`, run status `RUNNING` | `SUCCESS` |
  `PARTIAL` | `FAILED`

## Task

1. Create the workspace `apps/agent` (private, ESM, TypeScript strict like
   `apps/api`): `package.json` with the scripts `typecheck`, `test`, `test:run`
   and the dependency `@stoerdesk/shared`; `tsconfig.json` extending
   `tsconfig.base.json` with `lib: ['ES2022']` and `types: ['node']`;
   `vitest.config.ts` like the one of `apps/api`. The build script and the
   entry point follow in WP-M2-52.
2. Add `apps/agent/src/**/*.ts` to the root `tsconfig.json` include list and
   the workspace to `package-lock.json`, so the repository typecheck, the
   editor and `npm ci` see the new workspace.
3. Write `apps/agent/src/update-runner.ts`:
   - `UpdateRunnerOptions`: `{ checkoutPath, projectDirectory, composeFile,
     runCommand, restoreOwnership?, onRunFinished?, now?, createRunId? }` —
     `runCommand` is injected, so the runner is testable without a shell and
     without a Docker daemon.
   - `start()` runs the three steps of ADR-0006 in the background and refuses a
     second run while a run is active.
   - The git step: `git -c safe.directory=<checkout> pull --ff-only` with
     `GIT_TERMINAL_PROMPT=0`; the compose step: `docker compose
     --project-directory <dir> -f <file> up -d --build`; the prune step:
     `docker image prune -f`.
   - The version is read from the `VERSION` file of the checkout before and
     after the pull; the owner of the checkout is restored after the pull.
   - A failed step yields `FAILED` (the pull) or `PARTIAL` (the rebuild, the
     prune) with a fixed error code (`update_git_failed`,
     `update_compose_failed`, `update_prune_failed`), never with the output of
     a command, which could contain a secret.

## Non-goals

- No HTTP server, no image, no compose service (WP-M2-52, WP-M2-53).
- No database access — the agent never sees the database.
- No shell, no path and no argument from a request: the runner decides what a
  run is.

## Acceptance

```bash
npm run check
npm run build
```

Expected: typecheck, lint, tests, i18n and wp:check green; the unit test of the
runner proves the step order, the refusal of a second run, the error codes and
the restore of the owner.

## Handoff

- Files changed: the four files of `files-write` plus the root `tsconfig.json`,
  the `package-lock.json` and the test.
- Interfaces added: `UpdateRunner`, the run states and statuses.
- Verified: `npm run check` and `npm run build` green; the new workspace is
  part of `npm run typecheck --workspaces` and of the vitest projects.
- Follow-up WP: WP-M2-52 (the agent HTTP server and the entry point).
- Open question: none.
