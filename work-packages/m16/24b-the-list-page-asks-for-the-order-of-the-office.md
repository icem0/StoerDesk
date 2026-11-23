# WP-M16-24b: the list page asks for the order of the office

format: small-model
status: planned
depends-on: WP-M16-24a
phase: 16
milestone: m16
context-budget: 12k tokens
spec: specs/13-ui.md §14.9
spec-lines: 20

files-read:

- apps/web/src/features/tickets/ticket-list-page.tsx (the query of the list)
- apps/web/src/features/tickets/__tests__/ticket-list-page.test.tsx

files-write:

- apps/web/src/features/tickets/ticket-list-page.tsx
- apps/web/src/features/tickets/__tests__/ticket-list-page.test.tsx

interfaces:

- the list at `/tickets` asks `GET /api/v1/tickets` with `order=priority` and
  without a `direction`
- the list page reads no longer `GET /api/v1/settings/display` — the direction
  belongs to the history of a ticket (WP-M16-11d)

## Task

1. `apps/web/src/features/tickets/ticket-list-page.tsx` drops the query of
   `GET /api/v1/settings/display` and the direction that came out of it. The
   list asks the API for `order=priority` — the order of the office — and sends
   no `direction`.
2. `apps/web/src/features/tickets/__tests__/ticket-list-page.test.tsx` proves
   that the request of the list carries `order=priority` and no `direction`.

## Non-goals

- No change of the detail page: the history keeps its direction (WP-M16-11d).
- No text and no setting: the switch under „Darstellung“ is renamed in
  WP-M16-24c and gets its texts in WP-M16-24d.
- No change of the filters, of the search and of the pagination.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npx vitest run apps/web/src/features/tickets/__tests__/ticket-list-page.test.tsx
```

Expected: green; the new assertion fails before the change and passes after it.

## Handoff

- Files changed: `apps/web/src/features/tickets/ticket-list-page.tsx`,
  `apps/web/src/features/tickets/__tests__/ticket-list-page.test.tsx`
- Interfaces added: the order of the office as the query of the list
- Verified: `npm run typecheck`, `npm run lint`, the page test
- Follow-up WP: WP-M16-24c
- Open question: none
