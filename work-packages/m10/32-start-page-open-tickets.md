# WP-M10-32: the start page shows the statistics and the open tickets

format: small-model
status: planned
depends-on: WP-M10-31
phase: 10
milestone: m10
context-budget: 18k tokens
spec: specs/11-dashboard.md §11.2, §11.3, §11.4, §11.5; PLAN.md §13
spec-lines: 80

files-read:

- apps/web/src/features/dashboard/start-page.tsx (the current start page)
- apps/web/src/features/dashboard/open-tickets.tsx (the list of the open tickets)
- apps/web/src/features/dashboard/__tests__/start-page.test.tsx (the page test)
- apps/web/src/i18n/locales/de/ticket.json (the dashboard labels)
- specs/11-dashboard.md (§11.2–§11.5)

files-write:

- apps/web/src/features/dashboard/start-page.tsx
- apps/web/src/features/dashboard/__tests__/start-page.test.tsx
- apps/web/src/features/dashboard/__tests__/tv-page.test.tsx

interfaces:

- `StartPage` — the statistics first, then the list of the open tickets; no on-call tile
- `TvPage` — the same blocks as the start page

## Task

The office asked for the dashboard to show what the wall display shows: first
the statistics, then the open tickets. The on-call tile leaves the dashboard.

1. The start page renders the statistics first: the fault-free counter, the
   four tiles and the evaluations of the averages. Below them it renders the
   list of the open tickets through `OpenTickets`.
2. The on-call tile is gone from the start page. The snapshot keeps the
   `tiles.onCall` section — the contract does not change, only the rendering.
3. The page test asserts the new order (the tiles before the list), the
   absence of the on-call tile and the rows of the list with the mini
   timeline and the last event.
4. A new test for the wall display asserts that it renders the same list and
   that no on-call panel is left on it.

## Non-goals

- No change of the snapshot contract and no change of the API.
- No change of the channel tile and of the primary action.
- No new menu entry — the menu gets "Bereitschaft" in WP-M10-35.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the start page shows the statistics and the open tickets
and no on-call tile.

## Handoff

- Files changed: the start page, the start-page test, the new wall-display test
- Interfaces added: none
- Verified: typecheck, lint, test:run, i18n:check, wp:check
- Follow-up WP: WP-M10-33 (the readiness calendar) — the file exists in this commit
- Open question: none
