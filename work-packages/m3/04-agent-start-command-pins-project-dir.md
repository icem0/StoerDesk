# WP-M3-04: the agent start command pins the project dir and fills `.env`

format: small-model
status: implemented
depends-on: WP-M2-74, WP-M3-03
phase: 3
milestone: m3
context-budget: 16k tokens
spec: specs/18-self-update.md §18.4
spec-lines: 40

files-read:

- apps/web/src/admin/update-host-update.tsx — the start command of WP-M3-03
- docker-compose.yml — the `:?` variables and the `env_file` of `api`
- specs/18-self-update.md (§18.4)
- docs/DEPLOYMENT.md — host update, Arcane, troubleshooting

files-write:

- apps/web/src/admin/update-host-update.tsx
- apps/web/src/admin/__tests__/update-host-update.test.tsx
- specs/18-self-update.md
- docs/DEPLOYMENT.md

interfaces:

- the start command on `/admin/update`: `-p <project>` plus
  `--project-directory "$PWD"`, no `cd` from a label, no bind-mount mapping
- the same command appends missing `POSTGRES_PASSWORD` / `SESSION_SECRET` to the
  project `.env`, read with `docker exec <api> printenv <KEY>`

## Task

WP-M3-03 made the copied start command resolve the project directory through the
`working_dir` label and the bind mounts of the running containers. The field
showed the simpler and safer contract: the operator already stands in the project
folder of the stack, and compose can be told which folder and which project to
use. Replace the discovery:

1. Drop the `working_dir` label and the mount mapping completely. Keep the
   project name from the `com.docker.compose.project` label and pin the folder
   with `--project-directory "$PWD"`, so build contexts, relative paths and the
   `.env` all resolve in the folder the command was copied into.
2. Make the command usable where a panel keeps its variables in its own store and
   the folder has no `.env`. The compose file requires `POSTGRES_PASSWORD` and
   `SESSION_SECRET` (the `:?` defaults) and `api` declares `env_file: .env`, so
   compose fails without that file. Before the build, append **only the missing**
   keys to `.env`, reading each value from the running `api` container through
   `docker exec … printenv <KEY>` — the value never sits on the host command line
   and an existing value is never rewritten. Create the file with `umask 077`.
3. Keep `IMAGE_BUILD_CONTEXT`, the `update` profile and `--build` unchanged; the
   token of the agent still comes from its state volume, not from `.env`.
4. Docs: name the host path of an Arcane project, keep the rule that the label
   path is container-internal, and describe the `.env` rule instead of the old
   `--env-file` fallback.

## Non-goals

- No change of `scripts/update.sh` and of the agent itself (`apps/agent`): the
  agent already runs compose with `--project-directory`.
- No `.env` template, no secret generation and no rotation: existing values are
  never touched.
- No new permission, API or flag.

## Acceptance

```bash
npm run typecheck -w @stoerdesk/web
npm run check
```

Expected: all green. A mock-`docker` harness runs the extracted command and
proves: without `.env` it is created mode `0600` with both values taken from the
`api` container, a partial `.env` gains only the missing key, a complete `.env`
stays byte-identical and no `docker exec` runs, and compose is always called with
`-p <project> --project-directory $PWD`. The real panel run stays operator work.

## Handoff

- Files changed: `apps/web/src/admin/update-host-update.tsx`, its test, the spec
  §18.4, `docs/DEPLOYMENT.md`, the changelog and the backlog tables
- Interfaces added: none — the start command text only
- Verified: `sh -n` of the extracted command, the mock-`docker` harness,
  `npm run check` (e2e skipped: no usable Chromium in this container)
- Follow-up WP: WP-M3-02b (`m3/02b-update-agent-image-hygiene.md`) — the agent
  still prunes by label only
- Open question: none
