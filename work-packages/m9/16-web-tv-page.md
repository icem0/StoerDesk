# WP-M9-16: web TV wall display

format: small-model
status: done
depends-on: WP-M9-09, WP-M9-14
phase: 9
milestone: m9
context-budget: 14k tokens
spec: specs/11-dashboard.md §11.7
spec-lines: 40

files-read:

- specs/11-dashboard.md (§11.7 wall display)
- apps/web/src/routes/index.tsx (public route placement outside the shell)
- apps/web/src/features/tickets/status-page.tsx (public page style)
- apps/web/src/lib/api.ts (`apiFetch`)
- apps/web/src/i18n/locales/de/ticket.json (dashboard labels)
- apps/web/src/features/dashboard/use-dashboard.ts (polling pattern)

files-write:

- apps/web/src/features/dashboard/tv-page.tsx
- apps/web/src/routes/index.tsx
- apps/web/src/i18n/locales/{de,en}/ticket.json

interfaces:

- `TvPage` at `/tv/:token`, outside `RequireSession` and outside the shell
- 15-second polling of `GET /api/v1/tv/:token`
- large fault-free counter, tiles and burning-now list, no navigation and no phone

## Task

1. Add `tv-page.tsx`: read `:token` from the path, poll `GET /api/v1/tv/:token`
   every 15 seconds with TanStack Query, and render a full-screen layout without
   the shell.
2. Show the fault-free counter with days and record, the open/overdue/
   unreviewed/pool tiles, the on-call name and shift end (never the phone) and
   the burning-now list with remaining/overdue time.
3. Render a red "on-call not staffed" banner in text and a `404 tv_not_found`
   state without leaking data; stop polling after a 404.
4. Register `/tv/:token` outside the guarded shell, more specific than the
   catch-all so it never falls into the not-found page.
5. Add the TV labels to the `dashboard` section of both `ticket` locale files.

## Non-goals

- No SSE; the TV polls because it has no session cookie.
- No navigation or settings control on the display.
- No phone number and no channel detail.
- No per-display name or token management (WP-M9-17).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run build
npm run wp:check
```

Expected: all green; `/tv/<token>` renders without the shell, a wrong token
shows the not-found state, and no phone number is rendered.

## Handoff

- Files changed: the TV page, the route table, both ticket locale files
- Interfaces added: `/tv/:token`
- Verified: typecheck, lint, test:run, i18n:check, build, wp:check
- Follow-up WP: WP-M9-17 (dashboard settings page), WP-M9-18 (exit criterion)
- Open question: none
