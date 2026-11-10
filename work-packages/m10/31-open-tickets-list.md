# WP-M10-31: one list of the open tickets for the dashboard and the wall display

format: small-model
status: done
depends-on: WP-M10-30
phase: 10
milestone: m10
context-budget: 18k tokens
spec: specs/11-dashboard.md §11.2, §11.5; specs/13-ui.md
spec-lines: 60

files-read:

- apps/web/src/features/dashboard/tv-page.tsx (the wall display)
- apps/web/src/features/dashboard/start-page.tsx (the start page)
- apps/web/src/features/tickets/ticket-list-page.tsx (the mini timeline of the list)
- apps/web/src/i18n/locales/de/ticket.json (the dashboard labels)
- specs/11-dashboard.md (§11.5 the list of the open tickets)

files-write:

- apps/web/src/features/dashboard/open-tickets.tsx
- apps/web/src/features/dashboard/tv-page.tsx
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json

interfaces:

- `OpenTickets({ rows, generatedAt, linkRows })` — the list of the open tickets with the mini timeline and the last event
- `dashboard.openTickets.*` — the labels of the list in `de` and `en`

## Task

1. `apps/web/src/features/dashboard/open-tickets.tsx` renders the rows of the
   snapshot: object name, ticket number, status, priority, the remaining or
   the overdue time, the mini timeline (the bar of `specs/05-timeline.md`
   §5.3) and the last entry of the history with its time. The component takes
   the rows and the instant of the snapshot, so the wall display and the start
   page render the same thing.
2. The list has the heading "Offene Tickets" ("Open tickets"). The wording
   "Brennt jetzt" ("Burning now") is gone from the locale files — the category
   is called "offene Tickets" and nothing else.
3. `apps/web/src/features/dashboard/tv-page.tsx` renders the list through the
   component instead of its own list and loses the on-call panel: the wall
   display and the start page show the same blocks.
4. The labels of the list live under `dashboard.openTickets.*` in `de` and
   `en`; no literal string in the component.

## Non-goals

- No change of the start page — it adopts the list in WP-M10-32.
- No change of the snapshot contract.
- No change of the ticket list page.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the locale files carry the new keys in `de` and `en` and
no "Brennt jetzt" any more.

## Handoff

- Files changed: the new component, the wall display, both ticket locale files
- Interfaces added: `OpenTickets`, `dashboard.openTickets.*`
- Verified: typecheck, lint, test:run, i18n:check, wp:check
- Follow-up WP: WP-M10-32 (the start page) — the file exists in this commit
- Open question: none
