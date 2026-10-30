# WP-M0-05: Publish versioned Docker images after a green check

format: small-model
depends-on: WP-M0-04
phase: 0
context-budget: 18k tokens
spec: PLAN.md §18
spec-lines: 35

files-read:

- .github/workflows/check.yml
- scripts/docker-smoke.sh
- Dockerfile
- docker-compose.yml
- AGENTS.md
- PLAN.md

files-write:

- .github/workflows/build.yml
- scripts/docker-smoke.sh
- AGENTS.md
- .husky/post-commit

interfaces:

- GitHub Actions workflow `build and push`
- `ghcr.io/<owner>/stoerdesk-api:<version>`
- `ghcr.io/<owner>/stoerdesk-web:<version>`
- `sh scripts/docker-smoke.sh`

## Task

1. Fix the Docker smoke guard: `docker compose port` also matches `expose`
   entries without a host binding and reports them as `:0`, so only a real
   non-zero public port may fail the check.
2. Add `.github/workflows/build.yml`: run after a successful `check` workflow on
   `main`, resolve the exact `vMAJOR.MINOR.PATCH` tag at the checked-out commit,
   build the `api` and `web` targets and push them to GHCR.
3. Tag the images with the version, the version without `v`, the commit SHA and
   `latest` for a normal `main` run; keep manual runs limited to explicit
   versions.
4. Create annotated version tags in `.husky/post-commit`, so
   `git push --follow-tags` publishes them.
5. Extend `AGENTS.md` with the mandatory post-push CI check and reporting.

## Non-goals

- No Docker Hub publishing; GHCR with `GITHUB_TOKEN` only.
- No deployment change; the Compose stack keeps building from the checkout.
- No automatic Git tag creation in CI; the Husky hook remains the version source.
- No UI or domain work.

## Acceptance

```bash
sh -n scripts/docker-smoke.sh
npm run check
git push --follow-tags
```

Expected: local checks green; GitHub Actions runs `check` first, then
`build and push`; both `api` and `web` images appear under
`ghcr.io/<owner>/stoerdesk-*` with the pushed version tag.

## Handoff

- Files changed: `.github/workflows/build.yml`, `scripts/docker-smoke.sh`,
  `.husky/post-commit`, `AGENTS.md` — plus repository bookkeeping in
  `CHANGELOG.md`, `work-packages/README.md` and `docs/REPO-MAP.md`.
- Interfaces added: `build and push` workflow, versioned GHCR images.
- Follow-up WP: optional `API_IMAGE` / `WEB_IMAGE` support for deployments that
  pull the published images instead of building from source.
- Open question: none.
