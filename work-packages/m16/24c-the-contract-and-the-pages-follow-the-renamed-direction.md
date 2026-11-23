# WP-M16-24c: the contract and the pages follow the renamed direction

format: small-model
status: planned
depends-on: WP-M16-24b
phase: 16
milestone: m16
context-budget: 16k tokens
spec: specs/13-ui.md §14.9
spec-lines: 20

files-read:

- packages/shared/src/schemas/settings.ts (the contracts of the branding row)
- apps/api/src/settings/branding.ts (the reader and the writer of the row)
- apps/web/src/settings/branding-page.tsx (the form of the Darstellung)
- apps/web/src/features/tickets/ticket-detail-page.tsx (the history of a ticket)

files-write:

- packages/shared/src/schemas/settings.ts
- apps/api/src/settings/branding.ts and
  apps/api/src/settings/__tests__/branding.integration.spec.ts
- apps/web/src/settings/branding-page.tsx and
  apps/web/src/settings/__tests__/branding-page.test.tsx
- apps/web/src/features/tickets/ticket-detail-page.tsx and
  apps/web/e2e/workflow.spec.ts

interfaces:

- `historySortDirection` (`'asc' | 'desc'`) in `brandingResponseSchema`,
  `displaySettingsResponseSchema` and `updateBrandingRequestSchema` — the
  direction of the history of a ticket
- `DEFAULT_HISTORY_SORT_DIRECTION` and `HistorySortDirection` in the shared
  package
- the key `historySortDirection` in the jsonb row `branding`; a row of an older
  version keeps the key `ticketSortDirection` and is read as long as the new
  key is missing

## Task

1. `packages/shared/src/schemas/settings.ts` renames the field of the direction
   from `ticketSortDirection` to `historySortDirection` in the branding
   contract, in the display contract and in the update request, and renames
   `DEFAULT_TICKET_SORT_DIRECTION` and `TicketSortDirection` to
   `DEFAULT_HISTORY_SORT_DIRECTION` and `HistorySortDirection`. The default
   stays `'desc'` — the newest event of the history on top.
2. `apps/api/src/settings/branding.ts` reads the direction out of the row with
   `storedHistorySortDirection`: the key `historySortDirection` wins, the key
   `ticketSortDirection` of a row of an older version is the fallback, a value
   that is neither `'asc'` nor `'desc'` answers the default. The write stores
   the key `historySortDirection`.
3. `apps/web/src/settings/branding-page.tsx` and
   `apps/web/src/features/tickets/ticket-detail-page.tsx` use the new name. The
   comment of the detail page that names the direction is English.
4. The tests follow the new name: the integration spec of the branding, the
   test of the branding page and the comment in the e2e workflow.

## Non-goals

- No new table and no migration: the direction travels in the existing jsonb
  row; the old key of a row of an older version is read, not migrated.
- No change of the meaning of the direction: `'desc'` puts the newest event of
  the history on top, `'asc'` the oldest one.
- No new text: the key of the text stays `branding.field.ticketSortDirection`
  until WP-M16-24d names the history in it.
- No change of the list: the list has its own order (WP-M16-24a, WP-M16-24b).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npx vitest run apps/api/src/settings/__tests__/branding.integration.spec.ts apps/web/src/settings/__tests__/branding-page.test.tsx
```

Expected: green; the renamed field fails before the change and passes after it.

## Handoff

- Files changed: `packages/shared/src/schemas/settings.ts`,
  `apps/api/src/settings/branding.ts`,
  `apps/web/src/settings/branding-page.tsx`,
  `apps/web/src/features/tickets/ticket-detail-page.tsx` and their tests
- Interfaces added: `historySortDirection` in the shared contracts and in the
  branding row
- Verified: `npm run typecheck`, `npm run lint`, the two tests
- Follow-up WP: WP-M16-24d
- Open question: none
