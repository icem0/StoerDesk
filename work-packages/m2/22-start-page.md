# WP-M2-22: start page with ticket capture as primary action

format: small-model
status: in_progress
depends-on: WP-M2-21, WP-M2-20
phase: 2
context-budget: 24k tokens
spec: PLAN.md §13 (dashboard tiles, burning-now list), PLAN.md §14 (internal UI)
spec-lines: 40

files-read:

- apps/web/src/routes/index.tsx — route table
- apps/api/src/tickets/list.ts — GET /api/v1/tickets with the new filters
- apps/web/src/i18n/locales/de/ticket.json — ticket namespace
- apps/web/src/features/tickets/ticket-list-page.tsx — badge and table pattern

files-write:

- apps/web/src/features/dashboard/start-page.tsx
- apps/web/src/routes/index.tsx — index route of the shell
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json

interfaces:

- `StartPage` React component: the index route `/` of the guarded shell. Shows the
  primary action "Neue Störung melden" (links to `/tickets/create`), four tiles
  (gesamt, offen, überfällig, neu) and the "Brennt jetzt" list (five open tickets
  ordered by deadline).
- New i18n keys `ticket:dashboard.*` (de reference, en complete).

## Task

1. `apps/web/src/features/dashboard/start-page.tsx`: the start page. The tiles
   read the `total` of four list queries (`limit=1`): all, `open=true`,
   `overdue=true`, `status=NEW`. The "Brennt jetzt" list reads
   `open=true&order=deadlineAt&direction=asc&limit=5` and shows the remaining
   time until the deadline. Every tile links into the ticket list with the
   matching filter.
2. `apps/web/src/routes/index.tsx`: add the index route `/` rendering
   `StartPage`.
3. `apps/web/src/i18n/locales/{de,en}/ticket.json`: add `ticket.dashboard.*` keys.

## Non-goals

- The full dashboard of phase 9 (SSE live updates, /tv wall display, on-call
  tile, channel status)
- The "no malfunction since" counter (phase 9)
- Statistics charts (phase 9)

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
npm run i18n:check
```

Expected: all green.

## Handoff

- Files changed: the four files above
- Interfaces added: `StartPage`, index route `/`, `ticket.dashboard.*` i18n keys
- Follow-up WP: WP-M2-23 (ticket list → detail link)
