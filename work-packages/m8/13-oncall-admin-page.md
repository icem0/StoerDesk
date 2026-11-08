# WP-M8-13: on-call administration page

format: small-model
status: done
depends-on: WP-M8-06, WP-M8-09, WP-M8-10, WP-M8-13b
phase: 8
milestone: m8
context-budget: 24k tokens
spec: specs/04-oncall.md §4a.2–§4a.6, §4a.8
spec-lines: 130

files-read:

- specs/04-oncall.md (§4a.2 pools, §4a.3 shifts, §4a.5 swaps, §4a.6 warnings)
- apps/web/src/admin/bma-sync-page.tsx (admin page, forms and queries)
- apps/web/src/admin/admin-home-page.tsx (entry card pattern)
- apps/web/src/routes/index.tsx (route registration)
- apps/web/src/components/Shell.tsx (settings menu and admin navigation)
- apps/web/src/auth/use-permission.tsx (permission gating)

files-write:

- apps/web/src/admin/{oncall-page,admin-home-page}.tsx
- apps/web/src/routes/index.tsx
- apps/web/src/components/Shell.tsx
- apps/web/src/i18n/locales/{de,en}/{oncall,common}.json

interfaces:

- `OncallPage` at `/admin/oncall`, guarded by `RequireSession`
- pool list and create/rename/deactivate/delete
- week grid: range, pool filter, generate slots, assign/reassign, publish, delete
- warnings panel and swap approval/rejection
- settings form for the eight `oncall.*` keys and the default pool

## Task

1. Build `OncallPage` with TanStack Query: pools, shifts for the visible week,
   warnings and settings. Show the week in `Europe/Berlin` but send UTC bounds.
2. Pool section: list with shift count, create, rename, change group and
   deactivate; delete only when the API allows it, with the error code shown.
3. Grid section: choose pool and week, "generate slots", assign a technician
   from the pool members, publish a draft, reassign a slot, delete an unlocked
   slot. Every action refetches the grid and warnings.
4. Warnings and swap section: list unstaffed/unconfirmed slots and the
   `PENDING`/`ACCEPTED` swap requests of `GET /api/v1/oncall/swaps` (WP-M8-13b);
   approve or reject with the current user as admin.
5. Settings form: the eight keys of §4a.1 plus the default pool select; save
   through `PUT /api/v1/settings/oncall`.
6. Register the route, add the entry to the settings menu and the administration
   home card, and fill every label in the `oncall` namespace in `de` and `en`.

## Non-goals

- No ticket-coupling UI beyond the warning list.
- No my-shifts page (WP-M8-14).
- No offline support.
- No dashboard tile (phase 9).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run build
npm run wp:check
```

Expected: all green; the page is reachable at `/admin/oncall` and every string
comes from the `oncall` namespace.

## Handoff

- Files changed: the admin page, the route table, the shell menu, the
  administration home card, both on-call locale files and the `auth.links.oncall`
  key of both `common` files
- Interfaces added: `/admin/oncall` and the admin actions above
- Verified: web typecheck, lint, web test:run 148/148, i18n:check, build and
  wp:check green; the full API `npm run check` hit the pre-existing
  `permission denied to terminate process` in unrelated integration suites and
  is reported as unverified, not green
- Follow-up WP: WP-M8-14 (my-shifts page)
- Open question: none; the pending-swaps read route moved to WP-M8-13b so the
  UI package stays inside the layer rule of `PLAN.md` §17
