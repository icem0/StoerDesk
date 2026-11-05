# WP-M2-91b: mobile-first ticket list cards

format: small-model
status: implemented
depends-on: WP-M2-91 (touch targets and panel conventions), WP-M2-17b (ticket list)
phase: 2
context-budget: 16k tokens
spec: PLAN.md §14 (UI), PLAN.md §3.1 (i18n mechanics)
spec-lines: 10

files-read:

- apps/web/src/features/tickets/ticket-list-page.tsx — the table list (WP-M2-17b)
- apps/web/src/features/tickets/__tests__/ticket-list-page.test.tsx — mini timeline tests (WP-M6-12)
- apps/web/src/i18n/locales/de/ticket.json — `status.values.*`, `priority.*`, `list.*`

files-write:

- apps/web/src/features/tickets/ticket-list-page.tsx — ticket cards instead of the table

interfaces:

- one ticket = one card (`data-testid="ticket-card"`): number and status badge on the
  first line, priority badge, object name and object number below, mini timeline bar
  with the remaining time and the reported time at the bottom, the "view" link last
- the grid is one column on the phone, two from `sm` and three from `xl`; the table
  and its horizontal scrolling are gone
- status and priority labels come from `status.values.*` and `priority.*` (i18n) — the
  hardcoded German labels of the list page are removed
- search, filters, create button and pagination get `min-h-11` (44 px touch targets)

## Task

1. `ticket-list-page.tsx`: replace `TicketRow` (table row) with `TicketCard`
   (article) and the table markup with a responsive card grid.
2. Remove `STATUS_LABELS` and `PRIORITY_LABELS`; read the labels through
   `t('status.values.<status>')` and `t('priority.<priority>')`.
3. `min-h-11` on the search input, both selects, the create button and the pagination
   buttons.
4. `ticket-list-page.test.tsx`: the rows become cards
   (`closest('[data-testid="ticket-card"]')`); a new case proves the localized
   status and priority labels.

## Non-goals

- No filter/search/saved-view changes, no pagination change.
- No palette changes here (WP-M2-92c owns the light colors).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

## Handoff

- Files changed: `apps/web/src/features/tickets/ticket-list-page.tsx`,
  `apps/web/src/features/tickets/__tests__/ticket-list-page.test.tsx`
- Interfaces added: `TicketCard` with `data-testid="ticket-card"`, responsive card
  grid, i18n status/priority labels, 44 px touch targets on the list controls
- Verified: `npm run check` green (e2e skipped locally — no Chromium; no E2E spec
  drives the list page)
- Follow-up WP: WP-M2-92 (theme chain: 92 DB, 92b schemas/session, 92c admin API,
  92d shell + palette, 92e users settings) — the WP files of the chain are rewritten
  by their implementing commits
- Open question: none
