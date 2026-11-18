# WP-M14-134h: the route and the menu entry of the defaults

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 14k tokens
spec: PLAN.md §14; specs/08-objects-api.md §9.1; ADR-0029
spec-lines: 15

depends-on: WP-M14-134g

files-read:

- apps/web/src/routes/index.tsx (the routes of the administration)
- apps/web/src/settings/settings-page.tsx (the menu of the administration)
- apps/web/src/i18n/locales/de/settings.json (the labels of the menu)
- apps/web/src/admin/escalation-page.tsx (the page before, for the pattern)

files-write:

- apps/web/src/routes/index.tsx
- apps/web/src/settings/settings-page.tsx

interfaces:

- The route `/admin/defaults` renders `TicketDefaultsPage`
- The menu entry of the administration points at `/admin/defaults`

## Task

1. In `apps/web/src/routes/index.tsx`, register the route `/admin/defaults` with
   the page of WP-M14-134g, next to the other routes of the administration.
2. In `apps/web/src/settings/settings-page.tsx`, add the entry of the menu that
   points at `/admin/defaults` — the group of the administration, next to the
   entry of the escalation. The label comes from the locale
   `admin.menu.defaults`, which WP-M14-134g adds.
3. Add a test of the menu that proves the entry exists and points at
   `/admin/defaults`.

## Non-goals

- No change of the other entries of the menu.
- No change of the page itself (WP-M14-134g).
- No badge of the priority in the object list.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the page is reachable over the menu of the administration.

## Handoff

- Files changed: the routes of the web app, the menu of the administration
- Interfaces added: the route `/admin/defaults`, the menu entry
- Verified: `npm run check` (exit 0), the test of the menu proves the entry of the defaults
- Follow-up WP: WP-M14-134i (the create form starts from the priority of the object)
- Open question: none
