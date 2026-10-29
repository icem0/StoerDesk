# WP-M0-02: Start the UI even when the API is not healthy

format: small-model
depends-on: WP-M0-01
phase: 0
context-budget: 16k tokens
spec: PLAN.md §16 Phase 0
spec-lines: 35

files-read:

- docker-compose.yml
- Dockerfile
- apps/web/nginx-pwa.conf.template
- apps/api/src/index.ts
- docs/DEPLOYMENT.md

files-write:

- docker-compose.yml
- docs/DEPLOYMENT.md
- .github/workflows/check.yml

interfaces:

- `GET /healthz` (nginx)
- `GET /api/v1/health` (Fastify)
- `docker compose up -d --build`

## Task

1. Remove the `web` dependency on `api: service_healthy`. nginx resolves the API
   per request, so the static UI must start independently.
2. Keep the API command that applies migrations before serving; document that
   this is the migration step.
3. Document the startup order and the expected 502 on `/api/` while the API is
   still starting.
4. Add a Compose smoke check to CI only if the runner has Docker; otherwise keep
   the job manual and document it.

## Non-goals

- No separate `migrate` service.
- No change to the API health payload.
- No TLS or reverse-proxy change.
- No notification work.

## Acceptance

```bash
docker compose config
docker compose up -d --build
curl -fsS http://localhost:8080/healthz
curl -fsS http://localhost:8080/api/v1/health
docker compose stop api
curl -fsS http://localhost:8080/healthz
docker compose start api
docker compose down
```

Expected: `/healthz` answers while the API is stopped; `/api/v1/health` answers
again after the API starts.

## Handoff

- Files changed: `docker-compose.yml`, `docs/DEPLOYMENT.md`, CI workflow
- Interfaces added: none
- Follow-up WP: WP-M0-04
- Open question: whether the CI runner provides Docker
