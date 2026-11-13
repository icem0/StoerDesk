# WP-M4-15b: Member panel on the groups page (web)

format: small-model
status: planned
depends-on: WP-M4-15
phase: 4
context-budget: 20k tokens
spec: PLAN.md §14 (settings: users, groups), specs/01-rbac.md §3 (guard `user.read`/`user.write`)
spec-lines: 40

files-read:

- apps/web/src/admin/groups-page.tsx — table, edit panel and error handling of WP-M4-03
- apps/web/src/admin/users-page.tsx — user picker with `RoleCheckboxes` and the users query
- apps/api/src/admin/groups.ts — the member routes of WP-M4-15
- apps/web/src/i18n/locales/de/settings.json — the `admin.groups.*` key block
- apps/web/src/i18n/locales/en/settings.json — the `admin.groups.*` key block (en)

files-write:

- apps/web/src/admin/groups-page.tsx
- apps/web/src/admin/__tests__/groups-page.test.tsx
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json

interfaces:

- `GroupsPage` shows the members of the selected group: a name/email list, an add form that
  offers every user not yet in that group and a remove button per member
- reuses `GET /v1/groups/:id/members`, `POST /v1/groups/:id/members`,
  `DELETE /v1/groups/:id/members/:userId` from WP-M4-15 (guards `user.read` / `user.write`)
- new i18n keys `admin.groups.members.*` and the error keys
  `admin.groups.errors.user_not_found|membership_exists|membership_not_found` (de + en)

## Task

1. `groups-page.tsx`: add `useMemberList(groupId)` over `GET /v1/groups/:id/members` and a
   `useUsers()` query over `GET /v1/users` (both guarded by the existing `user.read` check), so
   the page can offer candidates.
2. Add a `MemberPanel({ group })` component: the current members as a table (`givenName
   familyName`, `email`) and, per member, a remove button that mutates
   `DELETE /v1/groups/:id/members/:userId`; below it an add form with one checkbox per candidate
   user (name as label, id as value) that mutates `POST /v1/groups/:id/members` with
   `{ userId }`. Every text goes through `useTranslation('settings')` keys `admin.groups.members.*`.
3. Extend `handledErrorCodes` with `user_not_found`, `membership_exists`, `membership_not_found`
   and render their `admin.groups.errors.*` texts.
4. Render `MemberPanel` for the group selected through the actions column (next to
   `EditGroupForm`) and invalidate `['groups']` plus the member query after each write.
5. `apps/web/src/admin/__tests__/groups-page.test.tsx`: component test with stubbed `fetch`
   (pattern of `roles-page.test.tsx`) asserting the member names, the add form and the
   remove button in `de`.

## Non-goals

- No group column on the users page (WP-M4-15c), no self-service group view for a user.
- No new route, schema or API field — the member routes of WP-M4-15 are reused unchanged.
- No migration and no change of the role or permission UI.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run i18n:check
npm run test:run -- apps/web/src/admin/__tests__/groups-page.test.tsx
npm run wp:check
```

Expected: all green; the new test fails before the change and passes after it; de/en keys stay
in parity.

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: WP-M4-15c (`15c-groups-membership-users-ui.md`)
- Open question: none
