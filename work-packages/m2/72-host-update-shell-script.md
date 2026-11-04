# WP-M2-72: the host update runs as a shell script

format: small-model
status: implemented
depends-on: WP-M2-71
phase: 2
context-budget: 16k tokens
spec: specs/18-self-update.md §18.7, docs/DEPLOYMENT.md
spec-lines: 170

files-read:

- docs/DEPLOYMENT.md — the host update and the Arcane deployment path
- scripts/push-release.mjs — the style of the existing host scripts
- apps/web/src/admin/update-host-update.tsx — the host update section
- apps/web/src/i18n/locales/de/settings.json — the German guide texts

files-write:

- scripts/update.sh
- package.json
- apps/web/src/admin/update-host-update.tsx
- apps/web/src/i18n/locales/de/settings.json

interfaces:

- `scripts/update.sh` with `--check`, `--yes`; `npm run update:host`
- the admin page guide shows `sh scripts/update.sh` instead of the agent start
- the agent stays optional: it only enables the in-UI button

## Task

1. Add `scripts/update.sh`: compare `VERSION` with the newest GitHub tag
   (`git ls-remote`, or the GitHub API without a checkout), ask once, pull a git
   work tree with `--ff-only --autostash`, otherwise leave the sources to the
   compose build, run `docker compose up -d --build` for the running project,
   keep running optional profiles (`backup`) and never touch the `update`
   profile.
2. Prune the dangling images with the project label filter; plain
   `docker image prune -f` when the project is unknown. Never `-a`.
3. Detect the compose project from `COMPOSE_PROJECT_NAME` or the running
   containers; work with `docker compose` and `docker-compose`.
4. Point the admin guide to the script command (`sh scripts/update.sh`,
   `npm run update:host`) and reword the optional agent. Update the German and
   English `settings` texts.
5. Document the script as the default in `docs/DEPLOYMENT.md`, add the spec
   §18.7 and the `docs/REPO-MAP.md` row (bookkeeping of this commit).

## Non-goals

- No removal of the agent, its API or its history; it remains the optional
  in-UI path.
- No automatic edit of `.env`; the script only warns when a panel deployment
  has no git checkout and no Git build context.
- No new API route, no new permission and no database change.

## Acceptance

```bash
sh -n scripts/update.sh
./scripts/update.sh --help
npm run check
```

Expected: the script parses and prints its help; typecheck, lint, tests, i18n
and wp:check are green. The real rebuild is host work and is not run in this
development container.

## Handoff

- Files changed: the files of `files-write`, the English locale, the docs, the
  spec and the changelog.
- Interfaces added: `scripts/update.sh`, `npm run update:host`.
- Verified: `sh -n`, `--help`, `npm run check`.
- Follow-up WP: none.
- Open question: none.
