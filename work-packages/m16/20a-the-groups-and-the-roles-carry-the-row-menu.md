# WP-M16-20a: the groups and the roles carry the row menu

format: small-model
status: done
depends-on: WP-M16-19
phase: 16
milestone: m16
context-budget: 15k tokens
spec: specs/13-ui.md §14.8; ADR-0043
spec-lines: 20

files-read:

- apps/web/src/admin/groups-page.tsx
- apps/web/src/admin/roles-page.tsx
- apps/web/src/admin/__tests__/groups-page.test.tsx and
  apps/web/src/admin/__tests__/roles-page.test.tsx
- apps/web/src/components/row-menu.tsx (the shared menu of the row)

files-write:

- apps/web/src/admin/groups-page.tsx
- apps/web/src/admin/roles-page.tsx
- apps/web/src/admin/__tests__/groups-page.test.tsx and
  apps/web/src/admin/__tests__/roles-page.test.tsx

interfaces:

- the group list of `/admin/groups`: the column „Aktionen“ holds the row menu
  with „Bearbeiten“
- the role list of `/admin/roles`: the column „Aktionen“ holds the row menu
  with „Bearbeiten“ — the system role `admin` keeps its „nur lesen“ note

## Task

1. The group table of `GroupsPage` replaces its „Bearbeiten“ button with the
   shared `RowMenu`; the edit of the group (the form with the members) opens as
   before. The group names itself once — the table has no second name.
2. The role table of `RolesPage` replaces its „Bearbeiten“ button with the
   shared `RowMenu`; the edit of the role (the permission grid) opens as
   before. The system role `admin` keeps its read-only note instead of a menu.
3. The tests prove: the menu of a row carries the action, the action opens the
   edit and the read-only role keeps its note.

## Non-goals

- No change of the API, of the permission grid and of the member panel.
- No change of the create pages (`/admin/groups/new`, `/admin/roles/new`).
- No change of the name of a group or of a role — both carry one name already.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
npm run build
```

Expected: all green; the new tests fail before the change and pass after it.

## Handoff

- Files changed: the four entries of `files-write`
- Interfaces added: none — the row menu of WP-M16-15 is used
- Verified: the commands above
- Follow-up WP: WP-M16-20b, WP-M16-20c, WP-M16-20d (each file exists in the
  commit of the split)
- Open question: none
