# WP-M2-24: administration home page

format: small-model
status: implemented
depends-on: WP-M2-20
phase: 2
context-budget: 22k tokens
spec: PLAN.md §14 (settings: users, groups, standard texts, deadlines, on-call grid,
channels, API keys), PLAN.md §5 (roles and permissions)
spec-lines: 40

files-read:

- apps/web/src/routes/index.tsx — route table
- apps/web/src/i18n/locales/de/settings.json — the settings namespace
- apps/web/src/admin/users-page.tsx — an existing admin page

files-write:

- apps/web/src/admin/admin-home-page.tsx
- apps/web/src/routes/index.tsx — /admin route
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json

interfaces:

- `AdminHomePage` React component: the route `/admin` inside the guarded shell.
  It lists the administration modules of `PLAN.md` §14. The available ones (users,
  roles) are links, the ones whose phase has not arrived yet (groups, standard
  texts, deadlines, on-call grid, channels, API keys) are marked as planned with
  their phase, so the gaps are visible instead of silently missing.
- New i18n keys `settings:admin.home.*` (de reference, en complete).

## Task

1. `apps/web/src/admin/admin-home-page.tsx`: the administration home page with a
   card per module. Available modules link to their page, planned modules show
   the phase they arrive in.
2. `apps/web/src/routes/index.tsx`: add the guarded `/admin` route.
3. `apps/web/src/i18n/locales/{de,en}/settings.json`: add `admin.home.*` keys.

## Non-goals

- The missing administration modules themselves (their phases own the API and the
  page)
- A permission gate for the admin area (the server guard stays the enforcement
  point)
- Breadcrumbs

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
- Interfaces added: `AdminHomePage`, route `/admin`, `settings:admin.home.*` keys
- Follow-up WP: WP-M2-25 (grouped settings menu), WP-M2-26 (back links in the admin pages)
