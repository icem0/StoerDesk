# WP-M16-20b: the users carry the row menu

format: small-model
status: done
depends-on: WP-M16-20a
phase: 16
milestone: m16
context-budget: 14k tokens
spec: specs/13-ui.md §14.8; ADR-0043
spec-lines: 20

files-read:

- apps/web/src/admin/users-page.tsx
- apps/web/src/admin/user-form-parts.tsx
- apps/web/src/admin/__tests__/users-page.test.tsx
- apps/web/src/components/row-menu.tsx (the shared menu of the row)

files-write:

- apps/web/src/admin/users-page.tsx
- apps/web/src/admin/__tests__/users-page.test.tsx

interfaces:

- the user list of `/admin/users`: the column „Aktionen“ holds the row menu
  with „Bearbeiten“

## Task

1. The user table of `UsersPage` replaces its „Bearbeiten“ button with the
   shared `RowMenu`; the edit of the user (the form with the roles and the
   groups) opens as before.
2. The row of a user names the colleague once — the table has no second name.
3. The test proves: the menu of a row carries the action and the action opens
   the edit.

## Non-goals

- No change of the API, of the roles and of the groups of a user.
- No change of the create page (`/admin/users/new`) and of the one-time
  password of a new colleague.
- No change of the personal settings page of a colleague.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
npm run build
```

Expected: all green; the new test fails before the change and passes after it.

## Handoff

- Files changed: the two entries of `files-write`
- Interfaces added: none — the row menu of WP-M16-15 is used
- Verified: the commands above
- Follow-up WP: WP-M16-20c, WP-M16-20d (each file exists in the commit of the
  split)
- Open question: none
