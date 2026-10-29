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
- README.md
- docs/REPO-MAP.md

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

Implementation notes: the run is isolated (project `stoerdesk-smoke`, own volume
names, published host port `3180` only — the API and the database stay on the
internal `backend` network) and uses a throw-away project directory with a
copy of `.env.example`, so neither the repository `.env` nor the volumes of a
developer stack are touched. On a machine without Docker the script cannot run;
the CI job is then the only executed acceptance and the limitation is reported in
the handoff.

## Handoff

- Files changed: `.github/workflows/check.yml`, `scripts/docker-smoke.sh`,
  `README.md`, `docs/REPO-MAP.md` — plus the repository bookkeeping that stays
  outside `files-write`: `AGENTS.md`, `CHANGELOG.md`, `work-packages/README.md`
- Interfaces added: `scripts/docker-smoke.sh`
- Follow-up WP: Phase 1 foundation
- Resolved: GitHub-hosted `ubuntu-latest` runners provide Docker; the job detects
  a usable Docker and skips on runners without it
- Verified locally: `sh -n` and `npm run check` only (no Docker in the dev
  container) — the smoke run itself is proven by the CI job
