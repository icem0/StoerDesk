# WP-M4-04: Groups administration link on the administration home

format: small-model
status: planned
depends-on: WP-M4-03
phase: 4
context-budget: 14k tokens
spec: PLAN.md §14 (settings: users, groups), PLAN.md §16 phase 4
spec-lines: 30

files-read:

- apps/web/src/admin/admin-home-page.tsx — administration module list
- docs/REPO-MAP.md — module table, updated after every WP

files-write:

- apps/web/src/admin/admin-home-page.tsx

interfaces:

- `AdminHomePage` module `groups` flips from `{ key: 'groups', phase: 'phase4' }` (planned)
  to `{ key: 'groups', to: '/admin/groups' }` (available), linking the GroupsPage from
  WP-M4-03

## Task

1. `apps/web/src/admin/admin-home-page.tsx`: replace the planned `groups` module entry
   with a link to `/admin/groups`, so administrators can reach the groups administration
   from the administration home. The `admin.home.modules.groups` i18n keys (title/hint)
   already exist in `de`/`en` (WP-M1-24 area) and are reused unchanged.

## Non-goals

- No new i18n keys.
- No migration: `groups`/`user_groups` exist in migration `0000_base_tables`.
- No user-group membership UI (later WP).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run i18n:check
npm run wp:check
```

Expected: all green.

## Handoff

- Files changed: `apps/web/src/admin/admin-home-page.tsx` (edit), `docs/REPO-MAP.md`
  (repo bookkeeping: two module rows for `groups.ts`/`groups-page.tsx`, tree updated;
  stays at 200 lines).
- Interfaces added: `/admin/groups` reachable from the administration home.
- Verified: typecheck, lint, i18n:check, wp:check green.
- Follow-up WP: membership add/remove on the groups page (users↔groups assignment).
- Open question: none.
