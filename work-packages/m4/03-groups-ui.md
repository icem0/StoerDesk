# WP-M4-03: Groups administration UI (web)

format: small-model
status: planned
depends-on: WP-M4-02
phase: 4
context-budget: 18k tokens
spec: PLAN.md §14 (settings: users, groups), PLAN.md §5 (roles and permissions)
spec-lines: 40

files-read:

- apps/web/src/admin/users-page.tsx — list/create/edit UI pattern with error codes
- apps/web/src/admin/roles-page.tsx — table + create/edit/delete pattern
- apps/web/src/routes/index.tsx — guarded route table
- apps/web/src/admin/admin-home-page.tsx — administration module list
- apps/web/src/i18n/locales/de/settings.json — settings namespace keys (de)
- apps/web/src/i18n/locales/en/settings.json — settings namespace keys (en)

files-write:

- apps/web/src/admin/groups-page.tsx
- apps/web/src/routes/index.tsx
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json

interfaces:

- `GroupsPage` at the guarded route `/admin/groups`: list groups with member
  count, create/edit group name, delete a group (`409 group_in_use` while
  members remain)
- Reuses `GET /api/v1/groups`, `POST /api/v1/groups`,
  `PATCH /api/v1/groups/:id`, `DELETE /api/v1/groups/:id` from WP-M4-02,
  guarded by `user.read` / `user.write`
- i18n keys `admin.groups.*` in the `settings` namespace (de + en)

## Task

1. `apps/web/src/admin/groups-page.tsx`: add `GroupsPage` mirroring
   `UsersPage`/`RolesPage` — a table of groups (name, member count, actions),
   a create form, an inline edit form and a delete button, all text through
   `useTranslation('settings')` keys `admin.groups.*`; guard reads with
   `usePermission('user.read')` and writes with `usePermission('user.write')`.
2. `apps/web/src/routes/index.tsx`: register the guarded route
   `/admin/groups` → `GroupsPage` next to `/admin/users` and `/admin/roles`.
3. `apps/web/src/i18n/locales/de/settings.json` and `en/settings.json`: add
   the `admin.groups.*` key block (title, table, forms, errors), keeping
   de/en parity.

## Non-goals

- No user-group membership UI (add/remove members) — a later WP exposes that
  on the groups page or the users page.
- No migration: `groups`/`user_groups` exist in migration `0000_base_tables`.
- No admin-home link yet — WP-M4-04 flips `groups` from planned phase 4 to
  the `/admin/groups` link.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run i18n:check
npm run wp:check
```

Expected: all green.

## Handoff

- Files changed: `apps/web/src/admin/groups-page.tsx` (new),
  `apps/web/src/routes/index.tsx` (edit), `apps/web/src/i18n/locales/de/settings.json`
  (edit), `apps/web/src/i18n/locales/en/settings.json` (edit).
- Interfaces added: `GroupsPage` at `/admin/groups`.
- Verified: typecheck, lint, i18n:check, wp:check green (the page hits the
  API, which needs a running server; DB integration tests skip locally).
- Follow-up WP: WP-M4-04 groups admin-home link.
- Open question: none.
