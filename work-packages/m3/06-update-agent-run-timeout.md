# WP-M3-06: the update agent run can never hang forever

format: small-model
status: planned
depends-on: WP-M3-05
phase: 3
milestone: m3
context-budget: 12k tokens
spec: specs/18-self-update.md §18.4, §18.6
spec-lines: 40

files-read:

- apps/agent/src/update-runner.ts — the run loop without any timeout
- apps/agent/src/index.ts — the command runner that spawns docker and git
- apps/agent/src/config.ts — the environment of the agent
- apps/agent/src/__tests__/update-runner.test.ts — the existing run tests
- specs/18-self-update.md (§18.4)

files-write:

- apps/agent/src/update-runner.ts
- apps/agent/src/config.ts
- apps/agent/src/index.ts
- apps/agent/src/__tests__/update-runner.test.ts

interfaces:

- `UPDATE_STEP_TIMEOUT_MS` — milliseconds after which a single update step
  (`git`, `compose`, `prune`) is aborted; default `600000` (10 minutes)
- `CommandResult.timedOut` — a step result that ran past its deadline

## Task

A host update runs in the background: the API answers before the rebuild
starts, because the rebuild replaces the API container and the request dies
with it. The administration polls `/admin/update` and shows `lastRun.status`.
If a step never returns — `docker compose up -d --build` waiting on a build
that never finishes, `git pull` blocked on a network that never answers — the
run stays `RUNNING` forever and `lastRun` shows `Läuft` without end.

Add a deadline per step:

1. `UpdateRunner` gets `stepTimeoutMs` (default `600000`, ten minutes,
   overridable with `UPDATE_STEP_TIMEOUT_MS`). Every step — `git pull`, the
   `docker compose ... up -d --build` and each `docker rmi`/`image prune` of
   the clean-up — runs against that deadline.
2. When a step passes its deadline, the step fails with the fixed error code
   `update_step_timeout` (WP-M3-05); the whole run finishes with `FAILED`
   (git step) or `PARTIAL` (compose/prune step), `finishedAt` is set and
   `errorDetail` names the timed-out step. The agent state leaves `running` —
   `lastRun` is no longer stuck at `Läuft`.
3. `CommandResult` carries `timedOut` so the step can distinguish a real
   non-zero exit code from a deadline.
4. The deadline is per step, not per run: a run may legitimately need several
   times one step's limit across its three steps, but no single step blocks
   the agent forever.

## Non-goals

- No kill of the operating system process behind a timed-out command: the
  deadline ends the run, not the host command (the rebuild may still finish on
  the host, the agent simply reports failure).
- No global run timeout across all three steps combined.
- No new route, permission or flag except `UPDATE_STEP_TIMEOUT_MS`.

## Acceptance

```bash
npm run typecheck -w @stoerdesk/agent
npm run check
```

Expected: all green. A new unit test drives the runner against a command that
never answers and proves the run leaves `running` with
`errorCode: 'update_step_timeout'` after the deadline instead of hanging.

## Handoff

- pending
