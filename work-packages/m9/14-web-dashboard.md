# WP-M9-14: web dashboard with live updates

format: small-model
status: planned
depends-on: WP-M9-06, WP-M9-07, WP-M9-04
phase: 9
milestone: m9
context-budget: 20k tokens
spec: specs/11-dashboard.md §11.2–§11.6
spec-lines: 110

files-read:

- specs/11-dashboard.md (§11.2 snapshot, §11.3 counter, §11.4 tiles, §11.5 burning now, §11.6 SSE)
- apps/web/src/features/dashboard/start-page.tsx (current start page)
- apps/web/src/lib/api.ts (`apiFetch`)
- apps/web/src/auth/use-permission.tsx (permission gating)
- apps/web/src/features/tickets/ticket-timeline.tsx (mini timeline)
- apps/web/src/i18n/locales/de/ticket.json (dashboard namespace)

files-write:

- apps/web/src/features/dashboard/use-dashboard.ts
- apps/web/src/features/dashboard/start-page.tsx
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json

interfaces:

- `useDashboard()` — initial snapshot, `EventSource` subscription and 30-second refetch fallback
- `StartPage` — fault-free counter, tiles, "burning now" with mini timelines and links
- dashboard labels in `de` and `en`

## Task

1. Add `use-dashboard.ts`: fetch `GET /api/v1/dashboard` with TanStack Query,
   subscribe to `GET /api/v1/dashboard/stream` with `EventSource`, update the
   query cache on every `dashboard` event, and refetch every 30 seconds when
   `EventSource` is unavailable; close the stream on unmount.
2. Rewrite `StartPage`: the fault-free counter with days and record, the
   open/overdue/unreviewed/pool tiles, the on-call tile (warning state in text,
   not colour alone) and the channel tile when present. Keep the primary action
   "Neue Störung melden".
3. Render "Brennt jetzt" from `burningNow` with the mini timeline of
   `ticket-timeline.tsx`, remaining/overdue time and a link to the detail.
4. Replace the old client-side count queries of the page; keep the tiles
   keyboard reachable and the 44 px touch target.
5. Add every new label to the `dashboard` section of both `ticket` locale files;
   no literal user-facing string.

## Non-goals

- No statistics page (WP-M9-15).
- No TV page (WP-M9-16) and no dashboard settings (WP-M9-17).
- No chart library.
- No new tile beyond §11.4.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run build
npm run wp:check
```

Expected: all green; the dashboard renders from the snapshot, the fallback
refetch works without `EventSource`, and the locale keys are complete.

## Handoff

- Files changed: the dashboard hook, the start page, both ticket locale files
- Interfaces added: `useDashboard`, the live start page
- Verified: typecheck, lint, test:run, i18n:check, build, wp:check
- Follow-up WP: WP-M9-15 (statistics page)
- Open question: none
