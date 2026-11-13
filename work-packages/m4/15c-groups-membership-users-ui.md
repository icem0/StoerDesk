# WP-M4-15c: The users page shows the groups of a user (web)

format: small-model
status: planned
depends-on: WP-M4-15
phase: 4
context-budget: 18k tokens
spec: PLAN.md §14 (settings: users, groups), specs/01-rbac.md §3 (guard `user.read`)
spec-lines: 30

files-read:

- apps/web/src/admin/users-page.tsx — table columns and the queries of WP-M1-09c
- apps/api/src/admin/groups.ts — `GET /v1/groups` and `GET /v1/groups/:id/members` (WP-M4-15)
- apps/web/src/admin/__tests__/users-page.test.tsx — the stubbed-fetch pattern
- apps/web/src/i18n/locales/de/settings.json — the `admin.users.*` key block
- apps/web/src/i18n/locales/en/settings.json — the `admin.users.*` key block (en)

files-write:

- apps/web/src/admin/users-page.tsx
- apps/web/src/admin/__tests__/users-page.test.tsx
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json

interfaces:

- `UsersPage` gains a `Group` column listing the names of the groups a user belongs to
- one new query `useMemberships()` resolves `GET /v1/groups` and the member list of every
  group into a map `userId -> groupNames`
- new i18n key `admin.users.table.groups` (de + en)

## Task

1. `users-page.tsx`: add `useMemberships()` — a single query whose `queryFn` reads
   `GET /v1/groups`, then `GET /v1/groups/:id/members` for every group (`Promise.all`) and
   returns `{ [userId]: [groupName, …] }` sorted by group name; invalidate it together with
   the `['users']` key.
2. Render a `admin.users.table.groups` column in the users table with the group names of that
   user (`', '` separated, empty when the user belongs to no group).
3. `users-page.test.tsx`: extend the stubbed routes with the group list and one member list and
   assert the group names of the seeded users; keep the existing assertions green.
4. `de`/`en` `settings.json`: add the `admin.users.table.groups` key, keeping parity.

## Non-goals

- No write access on the users page: assigning a user to a group stays on the groups page
  (WP-M4-15b).
- No change of `userSummarySchema` or of the user API — membership is read through the group
  routes only.
- No new route and no migration.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run i18n:check
npm run test:run -- apps/web/src/admin/__tests__/users-page.test.tsx
npm run wp:check
```

Expected: all green; the extended test fails before the change and passes after it.

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: none
- Open question: none
