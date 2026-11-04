# WP-M3-09: the deployment configuration of the update control

format: small-model
status: planned
depends-on: WP-M3-08
phase: 3
milestone: m3
context-budget: 14k tokens
spec: specs/18-self-update.md §18.5
spec-lines: 30

files-read:

- Dockerfile — the targets of the image
- docker-compose.yml — the services of the stack
- .env.example — the template of the environment
- docs/DEPLOYMENT.md — the deployment paths
- scripts/docker-smoke.sh — the smoke test of the stack

files-write:

- Dockerfile
- docker-compose.yml
- .env.example

interfaces:

- `GIT_COMMIT` — build argument of the `api` image, `unknown` by default
- `GITHUB_REPO`, `GITHUB_BRANCH`, `GITHUB_TOKEN` — the upstream repository
- `UPDATE_WEBHOOK_URL`, `UPDATE_WEBHOOK_TOKEN` — the deploy hook
- `extra_hosts: host.docker.internal:host-gateway` — the api service

## Task

The image and the stack must carry the configuration of §18.5:

1. `Dockerfile`: the `api` target takes `ARG GIT_COMMIT=unknown` and sets
   `ENV GIT_COMMIT=$GIT_COMMIT`, and it copies the tracked `VERSION` file into
   the image, so the API knows the installed version even without the build
   argument.
2. `docker-compose.yml`: the `api` service passes `GIT_COMMIT` as a build
   argument (`${GIT_COMMIT:-unknown}`) and the keys of §18.5 as environment;
   the service gets `extra_hosts: "host.docker.internal:host-gateway"`, so a
   webhook target on the host is reachable.
3. `.env.example`: the new keys with their default and a short comment; the
   token keys are empty and documented as "only in the API".

## Non-goals

- No removal of the agent yet — WP-M3-11 removes its service and its keys.
- No change of the database, the volumes or the ports.
- No secret in the repository: the token keys stay empty in the template.

## Acceptance

```bash
docker compose config
npm run check
```

Expected: `docker compose config` succeeds and shows the build argument, the
environment and the extra host; the quality gates stay green.

## Handoff

- Files changed: `Dockerfile`, `docker-compose.yml`, `.env.example`
- Interfaces added: the build argument, the environment keys, the extra host
- Verified: pending
- Follow-up WP: WP-M3-11 (the removal of the agent)
- Open question: none
