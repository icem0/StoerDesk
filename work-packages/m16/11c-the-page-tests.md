# WP-M16-11c: the page tests for the sort direction

format: small-model
status: done
depends-on: WP-M16-11a, WP-M16-11b
phase: 16
milestone: m16
context-budget: 8k tokens
spec: PLAN.md §14; specs/13-ui.md
spec-lines: 15

files-read:

- apps/web/src/settings/__tests__/branding-page.test.tsx
- apps/web/src/features/tickets/__tests__/ticket-list-page.test.tsx

files-write:

- apps/web/src/settings/__tests__/branding-page.test.tsx
- apps/web/src/features/tickets/__tests__/ticket-list-page.test.tsx

interfaces:

- the branding-page save assertions expect `ticketSortDirection` in the PUT body
- the ticket-list test asserts `direction=desc` and no `order=deadlineAt` (newest
  report on top by default)

## Task

1. `apps/web/src/settings/__tests__/branding-page.test.tsx` adds
   `ticketSortDirection: 'desc'` to the expected PUT bodies.
2. `apps/web/src/features/tickets/__tests__/ticket-list-page.test.tsx` replaces the
   `order=deadlineAt, direction=asc` assertion with `direction=desc` and the
   absence of `order=deadlineAt`.

## Non-goals

- No product-code change: WP-M16-11a and WP-M16-11b implement the feature.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run -- projects=web 2>/dev/null || npx vitest run apps/web/src/settings/__tests__/branding-page.test.tsx apps/web/src/features/tickets/__tests__/ticket-list-page.test.tsx
```

Expected: green.

## Handoff

- Files changed: `apps/web/src/settings/__tests__/branding-page.test.tsx`,
  `apps/web/src/features/tickets/__tests__/ticket-list-page.test.tsx`
- Verified: `npm run typecheck`, `npm run lint`, `npm run test:run`
- Follow-up WP: none
- Open question: none
