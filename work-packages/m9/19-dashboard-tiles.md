# WP-M9-19: dashboard tiles without the burning-now list

format: small-model
status: done
depends-on: —
phase: 9
milestone: m9
context-budget: 16k tokens
spec: PLAN.md §13, §14; specs/11-dashboard.md §11.4, §11.5
spec-lines: 60

files-read:

- PLAN.md (§13 dashboard, §14 user interface)
- specs/11-dashboard.md (§11.2 snapshot, §11.4 tiles, §11.5 burning now)
- apps/web/src/features/dashboard/start-page.tsx (the current start page)
- apps/web/src/i18n/locales/de/ticket.json (dashboard labels)
- apps/web/src/features/tickets/ticket-list-page.tsx (link style of the list)
- work-packages/m9/14-web-dashboard.md (the planned rewrite of the start page)

files-write:

- apps/web/src/features/dashboard/start-page.tsx
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json
- specs/11-dashboard.md

interfaces:

- `StartPage` — the greeting, the primary action and the four count tiles; every tile is one link over the whole tile
- `GET /api/v1/tickets?open=true&order=deadlineAt&direction=asc` — the list behind the tiles (unchanged contract)

## Task

1. Remove the "Brennt jetzt" list from the start page: the page ends after the
   tiles. The `burningNow` snapshot section stays in the API contract for the
   wall display (`specs/11-dashboard.md` §11.7), the start page no longer
   renders it.
2. Make every tile a link over its whole area: the `<Link>` gets
   `display: block`, so the padding, the border and the background belong to
   the link and not only to the text of the tile.
3. Show the pending and the failed state of the four count queries below the
   tiles, so the removed list does not take the only loading and error text
   with it.
4. Drop the labels the page no longer uses (`burningTitle`, `noOpenTickets`,
   `remaining`) from the `dashboard` section of both locale files.
5. Update `specs/11-dashboard.md` §11.5: the burning-now list belongs to the
   wall display, the start page shows the tiles only. Update WP-M9-14 with the
   same decision, so the phase-9 rewrite does not bring the list back.

## Non-goals

- No new tile, no fault-free counter and no on-call tile; those belong to
  WP-M9-14.
- No change of the ticket list, the filters or the tile targets.
- No change of the snapshot contract of WP-M9-05.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run build
npm run wp:check
```

Expected: all green; the start page renders the greeting and the four tiles,
every tile is one link, and no "Brennt jetzt" label is left in the locales.

## Handoff

- Files changed: the start page, both ticket locale files, the dashboard spec,
  the planned WP-M9-14
- Interfaces added: none
- Verified: typecheck, lint, test:run, i18n:check, build, wp:check
- Follow-up WP: WP-M9-20 (the ticket list order) and WP-M9-21 (the ticket list rows) — both files exist since this commit
- Open question: none
