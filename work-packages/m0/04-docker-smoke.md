# WP-M0-04: Add a repeatable Docker smoke test

format: small-model
depends-on: WP-M0-01, WP-M0-02
phase: 0
context-budget: 14k tokens
spec: PLAN.md §18
spec-lines: 35

files-read:

- .github/workflows/check.yml
- docker-compose.yml
- package.json
- scripts/wp-check.mjs

files-write:

- .github/workflows/check.yml
- scripts/docker-smoke.sh

interfaces:

- `scripts/docker-smoke.sh`
- CI job `docker-smoke`

## Task

1. Add `scripts/docker-smoke.sh`: copy `.env.example` to a temporary `.env`,
   run `docker compose config`, `build`, `up -d`, wait for both health endpoints,
   then `down -v`.
2. Make the script fail on any non-zero command and clean up with a trap.
3. Add a CI job that runs the script only when the runner provides Docker.
4. Document the manual command in the README quickstart.

## Non-goals

- No production deployment automation.
- No image registry push.
- No backup/restore test.
- No notification test.

## Acceptance

```bash
sh scripts/docker-smoke.sh
```

Expected: exit 0; the script prints both health responses and removes the
temporary Compose project.

## Handoff

- Files changed: `.github/workflows/check.yml`, `scripts/docker-smoke.sh`
- Interfaces added: `scripts/docker-smoke.sh`
- Follow-up WP: Phase 1 foundation
- Open question: whether the CI runner has Docker
