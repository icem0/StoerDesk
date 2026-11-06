# WP-M6-15: deadline admin page

format: small-model
status: done
depends-on: WP-M6-14b
phase: 6
milestone: m6
context-budget: 22k tokens
spec: specs/05-timeline.md §5.1; ADR-0008
spec-lines: 40

files-read:

- apps/web/src/admin/text-templates-page.tsx (form and permission pattern)
- apps/web/src/admin/__tests__/bma-sync-page.test.tsx (fetch stub pattern)
- packages/shared/src/schemas/deadlines.ts

files-write:

- apps/web/src/admin/deadlines-page.tsx
- apps/web/src/admin/__tests__/deadlines-page.test.tsx
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json

interfaces:

- `DeadlinesPage` (default page export named `DeadlinesPage`)

## Task

1. `deadlines-page.tsx`: load `GET /v1/settings/deadlines` with react-query; four hour inputs
   (low/normal/high/critical) and a table of the four reaction rules with a standard and a critical minute
   input. Submit with `PUT /v1/settings/deadlines`. Inputs are disabled without `settings.write`.
   A missing `settings.read` shows a notice, as in `TextTemplatesPage`.
2. The hint says that new tickets use the new values and existing tickets keep their stored deadline.
3. Add all new keys under `admin.deadlines` in `de` and `en`. Change the hint of the `deadlines` module
   (`admin.home.modules.deadlines.hint`) to the true scope: "Fristen und Reaktionsfristen je Priorität."
   (English equivalent). `npm run i18n:check` must pass.
4. Tests: renders the loaded values, sends the changed values in the PUT body, read-only without `settings.write`.

## Non-goals

- No route and no menu entry (WP-M6-16).
- No object-type (Objektart) fields.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green.

## Handoff

- Files changed: see files-write
- Interfaces added: `DeadlinesPage`
- Verified: typecheck, lint, test:run (670 tests), i18n:check, wp:check green; test:e2e skipped (no Chromium, unverified)
- Follow-up WP: WP-M6-16 (route and menu entry)
- Open question: none
