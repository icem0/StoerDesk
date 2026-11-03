# WP-M2-53b: the compose invocation of the agent and its image in the smoke test

format: small-model
status: implemented
depends-on: WP-M2-53
phase: 2
context-budget: 12k tokens
spec: specs/18-self-update.md §18.4, docs/DECISIONS/0006-host-update-agent.md
spec-lines: 130

files-read:

- apps/agent/src/update-runner.ts — the compose step of the runner
- scripts/docker-smoke.sh — the smoke test of the stack
- docker-compose.yml — the service and the profile
- docs/DECISIONS/0006-host-update-agent.md — the run steps

files-write:

- apps/agent/src/update-runner.ts
- scripts/docker-smoke.sh

interfaces:

- the compose step of the agent runs in the project directory, so the compose
  client reads the `.env` of the checkout and therefore the project name of the
  host
- the smoke test builds the image of the agent, so CI proves that the image
  with `git` and the Docker CLI can be built

## Task

1. Run the compose step of the agent in the project directory (the checkout of
   the host). The compose client reads the `.env` of the project from its
   working directory; without it the project name of the agent would fall back
   to the default and the agent would deploy a **second** stack next to the
   running one.
2. Build the image of the agent in the smoke test
   (`compose --profile update build update-agent`), so CI proves that the
   Alpine packages `git`, `docker-cli` and `docker-cli-compose` exist and that
   the bundle of the agent builds inside the image. The agent is not started by
   the smoke test — it stays opt-in.

## Non-goals

- No change of the run steps, no change of the image, no new env key.
- The smoke test does not start the agent and does not run a host update.

## Acceptance

```bash
npm run check
npm run build
```

Expected: the gates are green; the smoke test builds the agent image in CI
(the image build itself needs a Docker daemon, which the development container
does not have).

## Handoff

- Files changed: the two files of `files-write` plus the test.
- Interfaces added: none — the compose invocation and the coverage.
- Verified: `npm run check` green (335 tests); the smoke test builds the image
  of the agent in CI — the image build itself needs a Docker daemon, which the
  development container does not have.
- Follow-up WP: WP-M2-54 (the admin API).
- Open question: none.
