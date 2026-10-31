# WP-M1-16: current git version in the deployment environment

format: small-model
status: done
depends-on: WP-M1-15
phase: 1
context-budget: 12k tokens
spec: PLAN.md §16
spec-lines: 20

files-read:

- scripts/create-env.mjs
- docker-compose.yml
- apps/web/vite.config.ts
- apps/web/e2e/auth.spec.ts

files-write:

- scripts/env-version.mjs
- scripts/create-env.mjs
- package.json
- apps/web/e2e/auth.spec.ts

interfaces:

- `npm run env:version` — rewrites `VITE_APP_VERSION` in the existing `.env`
- `npm run env:create` — writes the current `VITE_APP_VERSION` into the new `.env`

## Task

WP-M1-15 made the shell show the build version, but a Docker build without an
explicit `VITE_APP_VERSION` still falls back to `dev` because the image build has no
git metadata. Docker Compose reads `.env`, so the current tag must get there.

1. Add `scripts/env-version.mjs`: read `git describe --tags --abbrev=0` and replace
   `VITE_APP_VERSION` in the existing `.env`; never print secrets.
2. In `scripts/create-env.mjs`, derive `VITE_APP_VERSION` from the same command
   instead of copying the template value `dev`.
3. Register `env:version` in the root `package.json` and document it in `README.md`
   plus `docs/DEPLOYMENT.md` as the refresh step after a checkout or pull.
4. Strengthen the smoke E2E: the app-version badge must contain a `vMAJOR.MINOR.PATCH`
   value, not only be visible.

## Non-goals

- No change to `Dockerfile`, `docker-compose.yml` or the CI publish chain.
- No runtime version endpoint and no attempt to read git from inside an image.
- No change to the UI component: WP-M1-15 already shows whatever the build carries.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the E2E fails if the resolved version is `dev`.

## Handoff

- Files changed: `scripts/env-version.mjs`, `scripts/create-env.mjs`, root
  `package.json`, the smoke E2E and the setup docs.
- Interfaces added: `npm run env:version`; `env:create` now carries the current tag.
- Verified: `npm run check` plus the local Chromium smoke E2E.
- Follow-up WP: none.
- Open question: none — a deployment panel that supplies its own `.env` must set
  `VITE_APP_VERSION` too, while GHCR images receive the tag from `build.yml`.
