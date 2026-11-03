# WP-M2-70: the page shows why the update failed

format: small-model
status: implemented
depends-on: WP-M2-69
phase: 2
context-budget: 12k tokens
spec: specs/18-self-update.md §18.4–§18.5
spec-lines: 130

files-read:

- apps/web/src/admin/update-host-update.tsx — the host update section
- packages/shared/src/schemas/update.ts — `errorDetail` of the run answer
- apps/web/src/i18n/locales/de/settings.json — the German texts
- apps/web/src/i18n/locales/en/settings.json — the English texts
- apps/web/src/admin/**tests**/update-host-update.test.tsx — the page test

files-write:

- apps/web/src/admin/update-host-update.tsx
- apps/web/src/admin/__tests__/update-host-update.test.tsx
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json

interfaces:

- the last run of the host update section shows the detail text of the failing
  step below the translated error code
- i18n keys `admin.update.host.errorDetailLabel` in de and en

## Task

1. Render `lastRun.errorDetail` below the last-run line: a monospace, scrollable
   block that keeps line breaks, only present when the detail is not empty.
2. The translated code stays visible — the detail supplements it, it does not
   replace it, and no error text is translated from the server.
3. Add `admin.update.host.errorDetailLabel` to the `settings` namespace in de
   and en, the same key set on both sides.
4. Extend the test: a failed run with a detail shows that text; a run without a
   detail shows no block.

## Non-goals

- No change of the API, the agent or the database.
- No stack trace view, no copy button, no log download.
- No detail for a run the agent never reported (the guide stays as it is).

## Acceptance

```bash
npm run check
```

Expected: typecheck, lint, tests, `i18n:check` (de and en complete) and
wp:check green.

## Handoff

- Files changed: the four files of `files-write`.
- Interfaces added: the i18n key `admin.update.host.errorDetailLabel`.
- Verified: `npm run check` green (389 tests, `i18n:check` 596 keys in de and en);
  the e2e job skipped — no usable Chromium in this container — and the Docker smoke
  test needs CI.
- Follow-up WP: none.
- Open question: none.
