# WP-M2-74: the host update shows the version and starts with a button

format: small-model
status: implemented
depends-on: WP-M2-73
phase: 2
context-budget: 16k tokens
spec: specs/18-self-update.md §18.2, §18.6, docs/DEPLOYMENT.md
spec-lines: 170

files-read:

- apps/web/src/admin/update-host-update.tsx — the host update section
- apps/web/src/admin/__tests__/update-host-update.test.tsx — the section tests
- apps/web/src/i18n/locales/de/settings.json — the German texts
- apps/web/src/lib/version.ts — the built-in app version

files-write:

- apps/web/src/admin/update-host-update.tsx
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json
- apps/web/src/admin/__tests__/update-host-update.test.tsx

interfaces:

- the section accepts an optional `clientVersion`, default `appVersion`
- three comparison states: update available, up to date, not comparable
- the start guide shows a command that discovers the compose project and its
  directory from the running web container

## Task

1. Compare the newest GitHub tag with the version of the checkout; when the
   agent knows no checkout version (a panel sync), use the built `appVersion`.
2. Treat an unparseable version as unknown instead of highest. Never render
   "latest version" when the comparison is unknown; show a distinct message.
3. Render the run button only when the agent is reachable. Without the agent,
   show the one-time start command with project and path discovery instead of a
   dead button.
4. Update the German and English texts and the tests (unknown version, built-in
   version fallback, no dead button).

## Non-goals

- No automatic GitHub request on mount; the check stays an explicit action.
- No removal of the agent, the shell script or the run history.
- No change to the API contract or the permissions.

## Acceptance

```bash
npm run check
```

Expected: typecheck, lint, tests, i18n and wp:check are green.

## Handoff

- Files changed: the files of `files-write`, plus the README table row.
- Interfaces added: optional `clientVersion` prop.
- Verified: `npm run check` (e2e skipped locally, no Chromium).
- Follow-up WP: none.
- Open question: none.
