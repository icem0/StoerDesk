# WP-M2-61: the administration carries the guide for the host update

format: small-model
status: implemented
depends-on: WP-M2-60
phase: 2
context-budget: 12k tokens
spec: specs/18-self-update.md §18.4–§18.5, docs/DECISIONS/0006-host-update-agent.md
spec-lines: 130

files-read:

- apps/web/src/admin/update-host-update.tsx — the host update section
- apps/web/src/admin/__tests__/update-host-update.test.tsx — the test of the section
- apps/web/src/i18n/locales/de/settings.json — the German texts
- apps/web/src/i18n/locales/en/settings.json — the English texts
- docs/DEPLOYMENT.md — how the agent is started

files-write:

- apps/web/src/admin/update-host-update.tsx
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json

interfaces:

- the host update section carries the guide how to start the agent while the
  agent does not answer: the two steps and the command, copyable to the
  clipboard

## Task

1. While the agent does not answer, the section shows the guide: the two steps
   (start the agent in the checkout directory of the host, reload the page) and
   the command `docker compose --profile update up -d update-agent` with a
   button that copies it to the clipboard.
2. The guide explains why the agent is opt-in: it holds the Docker socket of the
   host, so it does not run with the rest of the stack.
3. The texts of the guide and the reason texts of the agent go into the
   `settings` namespace (`admin.update.host.guide.*`), de and en with the same
   key set.
4. Extend the test: the guide appears with the command while the agent does not
   answer and disappears when it answers.

## Non-goals

- No change of the client-side update of stage 1.
- No automatic start of the agent — it stays opt-in, the socket is a host
  privilege.

## Acceptance

```bash
npm run check
```

Expected: typecheck, lint, tests, `i18n:check` (de and en complete) and
wp:check green.

## Handoff

- Files changed: the three files of `files-write` plus the test.
- Interfaces added: the i18n keys `admin.update.host.guide.*`.
- Verified: `npm run check` green (360 tests, `i18n:check` 571 keys in de and
  en).
- Follow-up WP: WP-M2-62 (the documentation of the token without the
  environment).
- Open question: none.
