# WP-M2-55: the host update section in the admin update page

format: small-model
status: planned
depends-on: WP-M2-54
phase: 2
context-budget: 18k tokens
spec: specs/18-self-update.md §18.1–§18.5, specs/13-ui.md
spec-lines: 130

files-read:

- apps/web/src/admin/update-page.tsx — the stage-1 page
- apps/web/src/admin/admin-home-page.tsx — the module card
- apps/web/src/i18n/locales/de/settings.json — the German texts
- apps/web/src/i18n/locales/en/settings.json — the English texts
- apps/web/src/lib/api-client.ts — the client of the API
- apps/web/src/admin/__tests__/update-page.test.tsx — the page test

files-write:

- apps/web/src/admin/update-page.tsx
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json
- apps/web/src/admin/update-host-update.tsx

interfaces:

- the host update section of `/admin/update`: agent state, the last run, the
  run button with an explicit confirmation
- new i18n keys `settings:admin.update.host.*` in de and en

## Task

1. Write `apps/web/src/admin/update-host-update.tsx`: the section that reads
   `GET /api/v1/admin/update/status`, shows the state of the agent (reachable
   or not), the current version, the last run and the button **Host-Update
   starten** / **Start host update**.
2. The button asks for an explicit confirmation (a confirm step, never a
   password) and then calls `POST /api/v1/admin/update/run`. While the run is
   active the section polls the status; the API is briefly unavailable while
   the stack restarts — the section shows that instead of failing, and it
   recovers when the API answers again.
3. The section is hidden when the user lacks `system.update`; a `403` answer
   is handled like a missing permission, not like an error.
4. Extend `apps/web/src/admin/update-page.tsx` with the section and the keys
   `settings:admin.update.host.*` in `de` and `en` (same key set, `i18n:check`
   green).
5. Extend the page test: the section renders, the confirmation is required
   before the run, and the unreachable agent is shown as such.

## Non-goals

- No change of the stage-1 behaviour (clean PWA update, outbox guard).
- No scheduling, no automatic update, no notification about a finished run.
- No literal text in the markup — everything through the i18n keys.

## Acceptance

```bash
npm run check
```

Expected: typecheck, lint, tests, `i18n:check` (de and en complete) and
wp:check green.

## Handoff

- Files changed: the four files of `files-write` plus the test.
- Interfaces added: the host update section and the i18n keys.
- Verified: `npm run check`.
- Follow-up WP: WP-M2-56 (documentation).
- Open question: none.
