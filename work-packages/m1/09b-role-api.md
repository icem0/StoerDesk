# WP-M1-09b: Role API (role CRUD and permission assignment)

format: small-model
status: implemented
depends-on: WP-M1-05, WP-M1-08, WP-M1-09
phase: 1
context-budget: 26k tokens
spec: specs/01-rbac.md §3.1, §3.4, §3.5, §3.8, §4.1
spec-lines: 26

files-read:

- specs/01-rbac.md (§3.1, §3.4, §3.5, §3.8, §4.1)
- apps/api/src/admin/users.ts
- apps/api/src/auth/requirePermission.ts
- apps/api/src/db/schema.ts
- packages/shared/src/permissions.ts
- packages/shared/src/schemas/user.ts

files-write:

- packages/shared/src/schemas/role.ts
- packages/shared/src/schemas/index.ts
- apps/api/src/admin/roles.ts
- apps/api/src/index.ts

interfaces:

- `roleSummarySchema`, `roleListResponseSchema`, `createRoleRequestSchema` and
  `updateRoleRequestSchema` exported from `@stoerdesk/shared`
- `adminRolesRoutes` (fastify-plugin, opts `{ database }`) with `GET`, `POST`, `PATCH`
  and `DELETE` on `/api/v1/roles[/:key]`
- guards: `role.read` for the list, `role.write` for create, update and delete
- error codes: `session_invalid` (`401`), `forbidden` (`403`), `invalid_request`
  (`400`), `role_not_found` (`404`), `role_key_taken`, `system_role_protected`,
  `role_in_use` (`409`) and `unknown_permission_key` (`422`)

## Task

Second slice of the legacy WP-M1-09: the role side of the admin area. The catalog, the
five system roles and the `protect_system_roles` trigger exist since WP-M1-05; this
package adds the routes and guards of `specs/01-rbac.md` §3.8, which WP-M1-09d reads.

1. `packages/shared/src/schemas/role.ts`: `roleKeySchema` is a trimmed string matching
   `^[a-z][a-z0-9_]{1,63}$`, `permissionKeysSchema` a de-duplicated string array as in
   `user.ts`. `roleSummarySchema` carries `id`, `key`, `isSystem`, sorted
   `permissionKeys` and `userCount`; create takes `key` plus `permissionKeys` (default
   `[]`), update an optional `permissionKeys`. Export from the schemas index.

2. `apps/api/src/admin/roles.ts`: fastify-plugin taking `{ database }` with one
   internal error class carrying `{ statusCode, code, params }`; bodies are parsed
   manually into `400 invalid_request` with field paths only. Every route runs
   `requirePermission(database, ...)` — the guard stays the only enforcement point.

3. `GET /api/v1/roles` (`role.read`): roles ordered by key, their `permissionKeys` from
   `role_permissions ⋈ permissions` and `userCount` grouped over `user_roles`; reply
   `{ roles }` through `roleListResponseSchema`.

4. `POST /api/v1/roles` (`role.write`): an existing or reserved key answers
   `409 role_key_taken`; every permission key goes through `isPermissionKey` before
   anything is written (`422 unknown_permission_key`); otherwise insert `roles` and
   `role_permissions` in one transaction and answer `201` with the summary.

5. `PATCH /api/v1/roles/:key` (`role.write`): unknown key `404 role_not_found`, seeded
   role `409 system_role_protected`; otherwise replace `role_permissions` in one
   transaction, refresh `updated_at` and answer `200` with the summary. `key` and
   `isSystem` never change.

6. `DELETE /api/v1/roles/:key` (`role.write`): same two guards, plus `409 role_in_use`
   while users still hold the role; otherwise delete (`role_permissions` cascades) and
   answer `204`.

7. `apps/api/src/index.ts`: register `adminRolesRoutes` with `{ database }` after
   `adminUsersRoutes`.

8. Test (excluded from `files-write`):
   `apps/api/src/admin/__tests__/roles.integration.spec.ts` — migrate, seed RBAC, admin,
   office and role-holder sessions. Required: anonymous `401`, office `403`, admin `200`
   with the five seeded roles and their grant counts, custom role `201`, unknown
   permission key `422`, duplicate and reserved key `409 role_key_taken`, invalid body
   `400` with field paths, PATCH replaces the grants and `GET /api/v1/me` of a holder
   reflects them without a new login, PATCH on a seeded role is refused, unknown key
   `404`, malformed key `400`, DELETE `409 role_in_use` while assigned and `204` after
   the assignment is gone.

## Non-goals

- No per-user `user_permissions` allow/deny endpoint, no role rename, no role copy and
  no audit trail (`specs/01-rbac.md` §3.8).
- No `usePermission` and no admin UI pages (WP-M1-09c, WP-M1-09d).
- No migration and no schema change: `roles`, `permissions`, `role_permissions` and the
  trigger of migration `0001` are used as they are.
- No group-based permissions, no change to `seed-rbac.ts` and no new permission keys.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green against a reachable PostgreSQL 16 (`TEST_DATABASE_URL` or the CI
service); a skip of the new integration spec must be reported and re-run on a database.

## Handoff

- Files changed: the four source files above, the integration spec, and the bookkeeping
  outside `files-write` (`specs/01-rbac.md` §3.1/§3.5/§3.8, `CHANGELOG.md`, `AGENTS.md`,
  `PLAN.md` §16, `docs/REPO-MAP.md`, `work-packages/README.md`)
- Interfaces added: shared role schemas, `adminRolesRoutes`, the four role routes
- Deviation: a unique violation on create also answers `409 role_key_taken`, so a
  parallel create never surfaces as `500`; a fieldless PATCH is a no-op
- Verified: `npm run check` green against PostgreSQL 16; 10 new role-API cases, the
  `/me` assertion proves a replaced grant set acts without a new login
- Follow-up WP: WP-M1-09c (`usePermission` and users UI), WP-M1-09d (roles UI)
- Open question: none — `user_permissions` over HTTP stays out of phase 1 (§3.8)
