# WP-M3-02b: the update agent removes the images it replaces

format: small-model
status: implemented
depends-on: WP-M3-02
phase: 3
milestone: m3
context-budget: 16k tokens
spec: specs/18-self-update.md §18.4
spec-lines: 45

files-read:

- work-packages/m3/02-update-script-image-hygiene.md — the cleanup rule to port
- apps/agent/src/update-runner.ts — `composeArgs`, `pruneArgs`
- apps/agent/src/**tests**/update-runner.test.ts — the recorded command list
- docker-compose.yml — the `image:` names of the stack

files-write:

- apps/agent/src/update-runner.ts
- apps/agent/src/**tests**/update-runner.test.ts
- docs/DEPLOYMENT.md

interfaces:

- `UpdateRunner.pruneCommands(project: string | null): { command: string;
args: readonly string[] }[]` — the `prune` step runs this list instead of one
  command
- the step chain stays `git` → `compose` → `prune`: no new `UpdateStep`, no
  change of `UPDATE_STEPS`, no API, schema or i18n change
- the `prune` step reports `update_prune_failed` only when every command of the
  list failed

## Task

Port the cleanup of WP-M3-02 to the agent so both update paths behave the same:

1. Replace `pruneArgs` by `pruneCommands`. The list is: `docker image ls
--no-trunc -q --filter reference=<name>` for the three `image:` names and the
   project default-name patterns, `docker image inspect` for the kept ids (the
   current image of each name, the images of the containers of the project) and
   `docker rmi <id>` for every owned id that is not kept — without `-f`.
2. Keep the existing `docker image prune -f --filter
label=com.docker.compose.project=<project>` as the last command of the list;
   never an unscoped prune.
3. The step is `ok` when at least one command succeeded or there was nothing to
   remove; a failing `rmi` (image still in use) is not a failed run.
4. Extend the recorded-command assertions in
   `apps/agent/src/__tests__/update-runner.test.ts`: the prune of a known project
   never contains a `docker image prune` without the label filter, and an owned
   unlabelled image id is removed with `docker rmi`.

## Non-goals

- No `--gc`, no `docker builder prune`, no `docker image prune -a` in the agent.
- No new `UpdateStep`, no new error code, no migration, no UI text.
- No change of the `git` and `compose` steps.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run check
```

Expected: all green; the new assertions fail against the current single-command
prune and pass after the change.

## Handoff

- Files changed: `apps/agent/src/update-runner.ts`,
  `apps/agent/src/__tests__/update-runner.test.ts`, `docs/DEPLOYMENT.md`, plus
  the bookkeeping (`docs/REPO-MAP.md`, `work-packages/README.md`, `PLAN.md` §16,
  `CHANGELOG.md`)
- Interfaces added: `Command` (exported), `OWN_IMAGES`,
  `UpdateRunnerOptions.ownImages`; private `pruneCommands(project, ownedBefore)`,
  `pruneStep(run, project, ownedBefore)`, `keptImageIds`, `imageIds`,
  `runningImageIds`. `pruneArgs` is gone.
- Two deviations from the task sketch, both deliberate: the kept ids are read
  with `docker image ls --filter reference=<name>` (the current image of each
  owned name) and `docker ps --all --filter label=com.docker.compose.project=…`
  (the images of the containers of the project) instead of `docker image`
  `inspect` — same kept set, no id list on a command line; and the owned ids are
  snapshotted **before** the compose step and passed in, because a replaced image
  is tagless afterwards and no name filter finds it — the same order
  `scripts/update.sh` uses.
- Verified: `npx tsc --noEmit -p apps/agent/tsconfig.json`, `npx eslint`
  `apps/agent`, `npx vitest run apps/agent` (27 tests, the new assertions fail
  against the old single-command prune), `npm run check`. The Docker rebuild and
  the smoke gate stay unverified here (no Docker daemon, `PLAN.md` §18).
- Follow-up WP: none
- Open question: none
