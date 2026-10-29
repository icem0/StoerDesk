# WP-M0-01: Build from the local checkout by default

format: small-model
depends-on: —
phase: 0
context-budget: 18k tokens
spec: PLAN.md §16 Phase 0
spec-lines: 40

files-read:

- PLAN.md
- .env.example
- docker-compose.yml
- docker-compose.local.yml
- README.md
- scripts/create-env.mjs

files-write:

- .env.example
- docker-compose.yml
- docker-compose.local.yml
- README.md

interfaces:

- `docker compose up -d --build`
- `npm run env:create`
- `IMAGE_BUILD_CONTEXT` (default `.`, Git URL for panels)

## Task

1. Change the Compose fallback build context from the remote `main` branch to
   the local checkout (`.`).
2. Update `.env.example`: `IMAGE_BUILD_CONTEXT=.` with a short comment that a
   deployment panel sets the Git URL instead.
3. Keep `docker-compose.local.yml` as the explicit developer override, but make
   it unnecessary for a normal local start.
4. Update the README quickstart so a fresh clone builds the checked-out code,
   not an older remote commit.

## Non-goals

- No change to the Dockerfile stages.
- No migration-service split.
- No change to the backup profile.
- No new environment variables.

## Acceptance

```bash
cp .env.example .env
docker compose config
docker compose build
docker compose up -d
curl -fsS http://localhost:3080/healthz
curl -fsS http://localhost:3080/api/v1/health
docker compose down
```

Expected: all commands exit 0; the images are built from the working tree.

## Handoff

- Files changed: `.env.example`, `docker-compose.yml`, `docker-compose.local.yml`, `README.md`
- Interfaces added: none
- Follow-up WP: WP-M0-02
- Open question: none
