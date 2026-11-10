# WP-M10-19b: the start page shows the evaluation block

format: small-model
status: planned
depends-on: WP-M10-19, WP-M9-14, WP-M9-19
phase: 10
milestone: m10
context-budget: 16k tokens
spec: specs/11-dashboard.md §11.2, §11.4a; ADR-0015
spec-lines: 40

files-read:

- apps/web/src/features/dashboard/start-page.tsx (the current start page)
- packages/shared/src/schemas/dashboard.ts (the `evaluations` block)
- apps/web/src/features/dashboard/__tests__/start-page.test.tsx (the page test)
- apps/web/src/i18n/locales/de/ticket.json (the `dashboard` section)
- specs/11-dashboard.md (§11.4a evaluations)

files-write:

- apps/web/src/features/dashboard/start-page.tsx
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json
- apps/web/src/features/dashboard/__tests__/start-page.test.tsx

interfaces:

- `StartPage` renders the evaluation block (averages only) below the tiles
- `dashboard.evaluations.*` labels in `de` and `en`

## Task

1. Below the four tiles, render the `evaluations` block of the snapshot: a
   panel titled "Auswertungen" with one line per average —
   `Ø Reactionsplit Prüfung`, `Ø Erstmal Rückmeldung`, `Ø Bestätigung`,
   `Ø Bearbeitung` — each value formatted as whole minutes, `null` shown as
   "keine Daten". Include the ticket count of the window in the panel header.
2. Every label comes from the `dashboard.evaluations.*` keys of the `ticket`
   namespace in `de` and `en` — no literal string.
3. No max, p90 or median line: the block shows averages only (ADR-0015
   decision 2); the worst reaction time is nowhere on the page.
4. Extend the start-page test: its snapshot fixture carries an
   `evaluations` object, and the test asserts the four average lines and the
   count; when `evaluations` is `undefined` (older snapshot) the block is
   omitted without breaking the other tiles.

## Non-goals

- No change of the wall display (`/tv/:token`) layout.
- No change of the statistics page.
- No SSE or API change.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the locale keys are complete in `de` and `en`.

## Handoff

- Files changed: the start page, both ticket locale files, the page test
- Interfaces added: the rendered evaluation block
- Verified: —
- Follow-up WP: none
- Open question: none
