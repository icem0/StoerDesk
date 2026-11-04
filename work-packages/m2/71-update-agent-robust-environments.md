# WP-M2-71: the host update works in panel deployments

format: small-model
status: implemented
depends-on: WP-M2-68, WP-M2-70
phase: 2
context-budget: 16k tokens
spec: specs/18-self-update.md §18.4, docs/DECISIONS/0006-host-update-agent.md
spec-lines: 138

files-read:

- apps/agent/src/update-runner.ts — the three steps and the compose invocation
- apps/agent/src/config.ts — the environment of the agent
- apps/agent/src/index.ts — the wiring of the runner
- docker-compose.yml — the service, the profile and the mounts
- docs/DEPLOYMENT.md — the Arcane deployment path

files-write:

- apps/agent/src/update-runner.ts
- apps/agent/src/config.ts
- apps/agent/src/index.ts
- docker-compose.yml

interfaces:

- `UpdateRunnerOptions.composeProject` and `UPDATE_AGENT_COMPOSE_PROJECT`:
  pin the compose project; empty reads the own container label
- the git step is `skipped` (not `failed`) when the checkout is no git work
  tree; the compose step still runs
- the compose step uses `-p <project>` and keeps running optional profiles
  (`backup`), never the `update` profile
- the prune is scoped to the compose project when it is known

## Task

1. Detect a git work tree before pulling. A panel such as Arcane syncs or builds
   the sources itself and leaves no `.git`; the pull must not fail the run then.
   The compose build is the update in that case.
2. Pull with `--autostash`, so a local change on the host does not abort the
   update.
3. Resolve the compose project from the agent's own
   `com.docker.compose.project` label when no project is configured. A panel
   project name is then redeployed instead of a second `stoerdesk` stack.
4. Redeploy and keep optional profiles that are running
   now (e.g. `backup`). Never enable the `update` profile: it contains the agent
   and the run would kill itself.
5. Prune the dangling images with the project label filter when the project is
   known; fall back to the plain prune otherwise.
6. Wire the optional env key in the compose service and document it in
   `.env.example`, the spec and the deployment guide (bookkeeping of this
   commit, outside `files-write`).
7. Extend the runner tests: skipped pull without a work tree, panel project
   name, kept `backup` profile and project-scoped prune.

## Non-goals

- No Arcane API or webhook integration; the compose build from the Git URL is
  the update path.
- No `docker image prune -a`, no deletion of images of other projects.
- No new run step and no change of the shared run schema or the `update_runs`
  table.

## Acceptance

```bash
npm run check
```

Expected: typecheck, lint, tests, i18n and wp:check green; the runner tests prove
the skipped pull without a work tree, the panel project name, the kept `backup`
profile and the project-scoped prune.

## Handoff

- Files changed: the files of `files-write` plus the documentation.
- Interfaces added: `composeProject`, `UPDATE_AGENT_COMPOSE_PROJECT`; the git
  step may be `skipped`.
- Verified: `npm run check`.
- Follow-up WP: none.
- Open question: none.
