# WP-M1-23: centred login card and app version display (retroactive record)

format: small-model
status: done (retroactive record — implemented in commit 3e1c0f8, 2026-10-30, without a WP)
depends-on: WP-M1-09e
phase: 1
context-budget: 16k tokens
spec: PLAN.md §14 (internal UI), §15 (maintainability: version visible), §18.3 (version of record)
spec-lines: 30

files-read:

- apps/web/src/auth/login-form.tsx
- apps/web/src/App.tsx
- docker-compose.yml
- .env.example

files-write:

- apps/web/src/auth/login-form.tsx
- apps/web/src/App.tsx
- apps/web/src/i18n/locales/de/common.json
- apps/web/src/i18n/locales/en/common.json

interfaces:

- `App()` shows the running version below the signed-in block: `common:app.version` plus
  the value of `import.meta.env.VITE_APP_VERSION` (fallback `dev`).
- `.env.example` and the `web` service of `docker-compose.yml` carry `VITE_APP_VERSION`.

## Task

This document does **not** describe new work. It records what commit `3e1c0f8`
(`feat(web): centered login card with app version display`) changed, so that no
phase 1 commit is left without a work package (`AGENTS.md`, _Open follow-ups
(mandatory closure)_).

1. The login screen became a centred card: `login-form.tsx` was rebuilt around a
   `max-w-sm` card with the 112-adjacent notices, larger touch targets and one notice
   for every failed credential.
2. `App.tsx` renders the application version under the signed-in block using the new
   `common:app.version` key (de and en).
3. The version came in through the build-time variable `VITE_APP_VERSION`: documented
   in `.env.example` and passed to the `web` service in `docker-compose.yml`.

## Non-goals

- No shell layout — that is WP-M1-13 and WP-M1-17.
- No version mechanism of its own — the `.env` value of this record was replaced by
  WP-M1-16 (the tracked `VERSION` file) and repaired by WP-M1-15 and WP-M1-22.

## Acceptance

The acceptance of the original commit, as it is gated today:

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run i18n:check
```

Expected: green; the version line is visible on the login screen.

## Handoff

- Files changed: `apps/web/src/auth/login-form.tsx`, `apps/web/src/App.tsx`, both
  `common.json`, plus — outside the four-file budget of `PLAN.md` §17 — `.env.example`
  and `docker-compose.yml`
- Interfaces added: `common:app.version`, `VITE_APP_VERSION` (removed again by
  WP-M1-16; the version today comes from the `VERSION` file through
  `apps/web/app-version.mjs` and `__APP_VERSION__`)
- Verified: the current tree still renders the badge (`AppVersion`, WP-M1-15) and the
  gates are green
- Deviation: the commit landed before this record existed and named no WP — the reason
  this document was written
- Follow-up WP: none — WP-M1-15, WP-M1-16 and WP-M1-22 already own the version path
- Open question: none
