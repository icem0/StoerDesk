# WP-M2-51: the update agent service core

format: small-model
status: planned
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
- apps/agent/src/update-runner.ts
- tsconfig.json — the root include list

interfaces:

- `createUpdateRunner(options)` in `@stoerdesk/agent`: starts one host update
  (`git pull` → `docker compose up -d --build` → `docker image prune -f`) and
  reports the steps, the versions and the error code
- run states `idle` | `running` | `failed`, run status `RUNNING` | `SUCCESS` |
  `PARTIAL` | `FAILED`

## Task

1. Create the workspace `apps/agent` (private, ESM, TypeScript strict like
   `apps/api`): `package.json` with the scripts `build`, `typecheck`, `test`,
   `test:run` and the dependency `@stoerdesk/shared`; `tsconfig.json` extending
   `tsconfig.base.json` with `lib: ['ES2022']` and `types: ['node']`.
2. Add `apps/agent/src/**/*.ts` to the root `tsconfig.json` include list, so the
   repository typecheck and the editor see the new workspace.
3. Write `apps/agent/src/update-runner.ts`:
   - `UpdateRunnerOptions`: `{ checkoutPath, composeFile, projectDirectory,
     runCommand }` — `runCommand` is injected, so the runner is testable
     without a shell.
   - `run()` executes the three steps in the order of ADR-0006 and returns
     `{ status, beforeVersion?, afterVersion?, errorCode?, steps }`.
   - The git step: `git -c safe.directory=<checkout> pull --ff-only` with
     `GIT_TERMINAL_PROMPT=0`; the compose step: `docker compose
     --project-directory <dir> -f <file> up -d --build`; the prune step:
     `docker image prune -f`.
   - The version is read from the `VERSION` file of the checkout before and
     after the pull; a failing step yields `FAILED` with a fixed error code
     (`update_git_failed`, `update_compose_failed`, `update_prune_failed`),
     never with output that could contain a secret.
   - Only one run at a time: a second `run()` while a run is active is refused.

## Non-goals

- No HTTP server, no image, no compose service (WP-M2-52, WP-M2-53).
- No ownership restore of the checkout (part of the git step of WP-M2-52, where
  the shell commands live).

## Acceptance

```bash
npm run check
```

Expected: typecheck, lint, tests, i18n and wp:check green; the unit test of the
runner proves the step order, the refusal of a second run and the error codes
with an injected `runCommand`.

## Handoff

- Files changed: the four files of `files-write` plus the test.
- Interfaces added: `createUpdateRunner`, the run states and statuses.
- Verified: `npm run check`.
- Follow-up WP: WP-M2-52 (the agent HTTP server).
- Open question: none.
