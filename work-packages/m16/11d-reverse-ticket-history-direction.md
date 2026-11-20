# WP-M16-11d: reverse ticket history direction under „Darstellung“

format: small-model
status: in_progress
depends-on: WP-M16-11
phase: 16
milestone: m16
context-budget: 10k tokens
spec: PLAN.md §14; specs/13-ui.md
spec-lines: 20

files-read:

- apps/web/src/features/tickets/ticket-detail-page.tsx (the history / Verlauf render)
- apps/web/src/features/tickets/__tests__/ticket-detail-comment.test.tsx
- apps/web/src/features/tickets/__tests__/ticket-detail-escalation.test.tsx

files-write:

- apps/web/src/features/tickets/ticket-detail-page.tsx

interfaces:

- the ticket history (Verlauf) in the ticket detail is sorted by `createdAt`
  using the same `ticketSortDirection` setting from „Darstellung“ as the ticket
  list: `'desc'` shows the newest entry on top, `'asc'` the oldest one

## Task

1. `apps/web/src/features/tickets/ticket-detail-page.tsx` sorts `historyEvents`
   by `createdAt` using `display.data?.ticketSortDirection ?? DEFAULT_TICKET_SORT_DIRECTION`:
   `'desc'` puts the newest message on top, `'asc'` the oldest one at the top.

## Non-goals

- No new setting: the existing `ticketSortDirection` checkbox under „Darstellung“
  steers both the ticket list and the ticket history.
- No database or API change: the direction travels in the same branding row.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run -- projects=web 2>/dev/null || npx vitest run apps/web/src/features/tickets/__tests__/ticket-detail-comment.test.tsx apps/web/src/features/tickets/__tests__/ticket-detail-escalation.test.tsx
```

Expected: green.

## Handoff

- Files changed: `apps/web/src/features/tickets/ticket-detail-page.tsx`
- Verified: `npm run typecheck`, `npm run lint`, `npm run test:run`
- Follow-up WP: none
- Open question: none
