# WP-M10-36: one display for the dashboard and the wall monitor

format: small-model
status: done
depends-on: WP-M10-31, WP-M10-32
phase: 10
milestone: m10
context-budget: 20k tokens
spec: specs/11-dashboard.md §11.2, §11.5, §11.7; PLAN.md §13
spec-lines: 60

files-read:

- apps/web/src/features/dashboard/start-page.tsx (the start page)
- apps/web/src/features/dashboard/tv-page.tsx (the wall display)
- apps/web/src/features/dashboard/open-tickets.tsx (the list of the open tickets)
- apps/web/src/features/dashboard/__tests__/start-page.test.tsx (the page test)
- specs/11-dashboard.md (§11.2, §11.5, §11.7)

files-write:

- apps/web/src/features/dashboard/display.tsx
- apps/web/src/features/dashboard/start-page.tsx
- apps/web/src/features/dashboard/tv-page.tsx
- apps/web/src/features/dashboard/__tests__/tv-page.test.tsx

interfaces:

- `DashboardDisplay({ snapshot, interactive })` — the one display of the dashboard for both surfaces
- `TvPage` — the wall monitor renders the display with `interactive: false`

## Task

The office wants the wall monitor to show the dashboard itself — no second
view any more. One rendering for both surfaces, and on the wall nothing is
clickable: it is a display only.

1. `apps/web/src/features/dashboard/display.tsx` exports
   `DashboardDisplay({ snapshot, interactive })` and renders the blocks in the
   order of `specs/11-dashboard.md` §11.5: the greeting with the fault-free
   counter, the four tiles, the evaluations of the averages, the list of the
   open tickets (`OpenTickets`) and the channel tile. When `interactive` is
   false: no `Link` is rendered (tiles, ticket numbers and the channel tile
   are plain blocks), the primary action "Neue Störung melden" is omitted and
   the snapshot is shown as it is — a display never navigates.
2. `start-page.tsx` keeps only the loading and error state of the snapshot
   query and renders `DashboardDisplay` with `interactive: true`.
3. `tv-page.tsx` keeps the token query, the `tv_not_found` state and the
   loading state and renders `DashboardDisplay` with `interactive: false`.
   The on-call panel and the old wall-display typography are gone — the wall
   shows the dashboard, not a second view.
4. The new test `tv-page.test.tsx` asserts: the same blocks as on the start
   page (counter, tiles, "Offene Tickets", evaluations), no link anywhere,
   no primary action, no readiness text.

## Non-goals

- No change of the snapshot contract, the API or the TV token.
- No change of the dashboard settings page (the token stays the entry of the
  wall display).
- No anonymisation change (`tv_anonymize` stays in the API).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the start page and the wall display render the same
blocks; the wall display has no link.

## Handoff

- Files changed: the shared display, the start page, the wall display, the
  new wall-display test
- Interfaces added: `DashboardDisplay`
- Verified: typecheck, lint, test:run, i18n:check, wp:check
- Follow-up WP: none
- Open question: none
