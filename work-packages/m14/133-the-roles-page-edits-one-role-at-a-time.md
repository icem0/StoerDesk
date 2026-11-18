# WP-M14-133: The roles page edits one role at a time

format: small-model
status: done
depends-on: WP-M1-09d
phase: 14
milestone: m14
context-budget: 16k tokens
spec: specs/01-rbac.md §3.8; PLAN.md §5
spec-lines: 40

files-read:

- apps/web/src/admin/roles-page.tsx (the role table, the editor and the checkbox grid)
- apps/web/src/admin/__tests__/roles-page.test.tsx (the page test)
- apps/api/src/admin/roles.ts (the role API — `GET`, `PATCH /api/v1/roles/:key`)
- apps/api/src/db/seed-rbac.ts (the seed rewrites the grants of the system roles)
- packages/shared/src/permissions.ts (the permission catalog of the checkbox grid)
- specs/01-rbac.md §3.8 (the contract of the role API)

files-write:

- apps/web/src/admin/roles-page.tsx
- apps/web/src/admin/__tests__/roles-page.test.tsx

interfaces:

- `RolesPage` — the selected role is a key (`editingRoleKey`), the editor is mounted
  with `key={role.key}` and therefore starts from the grants of that role
- `PATCH /api/v1/roles/:key` — the body carries the `permissionKeys` of that one
  role; the API is unchanged

## Task

The office reported that the permission checkboxes of the role management do not
belong to the selected role: the checkboxes of the role before stay, and "Speichern"
writes them to the role that is open now. The API is right — the grants are replaced
per role (`role_permissions` of that `role_id`) — the editor of the web app keeps the
state of the role before, because React reuses the same component instance when the
prop `role` changes.

1. `roles-page.tsx`: the page keeps the key of the selected role (`editingRoleKey`)
   instead of the whole role object and derives the role from the answer of the
   query, so the editor always starts from the grants the server holds. The editor
   is mounted with `key={editingRole.key}`, so a new role mounts a new editor with
   its own state and the checkboxes of the role before never leak into it.
2. `roles-page.test.tsx`: two cases prove it. The first opens a role, then another
   one and reads the checkboxes: the second role shows its own grants. The second
   changes a checkbox of the first role, opens the second role, saves and reads the
   request: the body carries the grants of the second role and the URL its key.

## Non-goals

- No change of the API, of the schema and of the seed: the role API of
  `specs/01-rbac.md` §3.8 replaces the grants of one role and the seed stays the
  authority for the five system roles (§3.5) — the grants of a system role are
  rewritten on the next seed run, a custom role keeps them.
- No change of the create form, of the delete button and of the texts: the grid of
  the permissions, the labels and the error codes stay as they are.
- No change of the user administration, which assigns the roles to the users.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the two new cases fail before the change (the checkboxes of
the role before stay) and pass after it.

## Handoff

- Files changed: `apps/web/src/admin/roles-page.tsx`,
  `apps/web/src/admin/__tests__/roles-page.test.tsx`, this document,
  `work-packages/README.md`, `CHANGELOG.md`, `docs/REPO-MAP.md`, `PLAN.md` §16
- Interfaces added: none — the page keeps its route, its texts and its requests
- Verified: `npm run typecheck --workspaces --if-present`, `npm run lint`,
  `npm run test:run`, `npm run i18n:check`, `npm run wp:check`
- Follow-up WP: none
- Open question: none
