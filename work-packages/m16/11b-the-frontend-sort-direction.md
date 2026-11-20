# WP-M16-11b: the frontend sort-direction checkbox and list order

format: small-model
status: in_progress
depends-on: WP-M16-02, WP-M16-11, WP-M16-11a
phase: 16
milestone: m16
context-budget: 12k tokens
spec: PLAN.md §14; specs/13-ui.md
spec-lines: 25

files-read:

- apps/web/src/settings/branding-page.tsx
- apps/web/src/features/tickets/ticket-list-page.tsx
- apps/web/src/i18n/locales/de/common.json
- apps/web/src/i18n/locales/en/common.json

files-write:

- apps/web/src/settings/branding-page.tsx
- apps/web/src/features/tickets/ticket-list-page.tsx
- apps/web/src/i18n/locales/de/common.json
- apps/web/src/i18n/locales/en/common.json

interfaces:

- a checkbox „Neueste zuerst“ / „Newest first“ on the form of the Darstellung,
  below the accent colour, with `branding.field.ticketSortDirection` and
  `branding.hintTicketSortDirection` in `de` and `en`
- the ticket list reads `GET /api/v1/settings/display`, orders by `reportedAt` in
  the configured direction and defaults to descending (newest report on top)

## Task

1. `apps/web/src/settings/branding-page.tsx` renders the checkbox „Neueste zuerst“
   below the accent colour with its hint, prefilled from the stored direction, and
   sends `ticketSortDirection` (`'desc'` when checked, `'asc'` otherwise) in the
   save body.
2. `apps/web/src/features/tickets/ticket-list-page.tsx` reads
   `GET /api/v1/settings/display`, passes `direction` (default `'desc'`) to the
   ticket query instead of the hard-coded `order=deadlineAt, direction=asc`, and
   orders by `reportedAt`.
3. The texts `branding.field.ticketSortDirection` and
   `branding.hintTicketSortDirection` are added to `common.json` in `de` and `en`.

## Non-goals

- No backend change: WP-M16-11a provides the setting; WP-M16-11c tests the pages.
- No change of the dashboard or wall-display order: only `/tickets` is affected.
- No per-user preference: the direction is an instance value under „Darstellung“.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run i18n:check
npm run test:run -- projects=web 2>/dev/null || npx vitest run apps/web/src/settings/__tests__/branding-page.test.tsx apps/web/src/features/tickets/__tests__/ticket-list-page.test.tsx
```

Expected: green; the new assertions fail before the change and pass after it.

## Handoff

- Files changed: `apps/web/src/settings/branding-page.tsx`,
  `apps/web/src/features/tickets/ticket-list-page.tsx`, the two `common.json`
  locale files
- Interfaces added: the „Neueste zuerst“ checkbox under „Darstellung“, the keys
  `branding.field.ticketSortDirection` and `branding.hintTicketSortDirection`,
  the direction parameter of the ticket list
- Verified: `npm run typecheck`, `npm run lint`, `npm run i18n:check`,
  `npm run test:run`
- Follow-up WP: WP-M16-11c
- Open question: none
