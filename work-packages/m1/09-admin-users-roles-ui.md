# WP-M1-09: Admin users API (list, create, update)

format: small-model
depends-on: WP-M1-08
phase: 1
context-budget: 28k tokens
spec: specs/01-rbac.md §3.1, §3.2, §3.5, §3.6, §4.1; PLAN.md §5, §16

files-read:

- specs/01-rbac.md (§3.1, §3.2, §3.5, §3.6, §4.1)
- apps/api/src/auth/requirePermission.ts
- apps/api/src/auth/password.ts
- apps/api/src/db/schema.ts
- packages/shared/src/permissions.ts
- apps/api/src/index.ts

files-write:

- packages/shared/src/schemas/user.ts
- packages/shared/src/schemas/index.ts
- apps/api/src/admin/users.ts
- apps/api/src/index.ts

interfaces:

- `userSummarySchema`, `userListResponseSchema`, `createUserRequestSchema`,
  `updateUserRequestSchema` exported from `@stoerdesk/shared`
- `adminUsersRoutes` (fastify-plugin, opts `{ database }`) registering
  `GET /api/v1/users`, `POST /api/v1/users`, `PATCH /api/v1/users/:id`
- permission guards: `user.read` for list, `user.write` for create/update
- error codes: `session_invalid` (`401`), `forbidden` (`403`), `invalid_request`
  (`400`), `user_not_found` (`404`), `email_taken`/`last_admin` (`409`),
  `unknown_role_key` (`422`)

## Task

Split note: the legacy package mixed the user API, role API, `usePermission` and
two admin pages, above the `PLAN.md` §17 limits. Follow-ups: WP-M1-09b (role API),
WP-M1-09c (users UI), WP-M1-09d (roles UI).

1. `packages/shared/src/schemas/user.ts`: add the four schemas named above. A user
   summary has `id`, `email`, `locale` (`de` or `en`), `active` and `roleKeys`.
   Create takes a normalized e-mail, a 12–256 character password, `locale`,
   `active` and unique `roleKeys`. Update accepts the same mutable fields without
   `email`, all optional, so role assignment, deactivation, locale and password
   reset share one endpoint. Export from `packages/shared/src/schemas/index.ts`.

2. `apps/api/src/admin/users.ts`: create a fastify-plugin taking `{ database }`.
   Each route uses `requirePermission(database, ...)`. Parse bodies manually and
   answer invalid bodies as `400 { code: 'invalid_request', params: { fields } }`;
   parse `:id` as UUID with the same field error. Never include e-mail addresses
   or passwords in params or logs.

3. `GET /api/v1/users` (`user.read`): load all users sorted by e-mail and their
   role keys from `user_roles ⋈ roles`; reply `{ users }` parsed through
   `userListResponseSchema`. No password hashes are returned.

4. `POST /api/v1/users` (`user.write`): validate every requested role key against
   existing `roles.key` values; throw `422 unknown_role_key` when one is missing.
   Hash the password with `hashPassword`, insert the user and `user_roles` rows in
   one transaction, answer `201` with the user summary. If the normalized e-mail
   already exists, answer `409 email_taken`.

5. `PATCH /api/v1/users/:id` (`user.write`): update only supplied fields
   (`locale`, `active`, `roleKeys`, optional new password). Replace `user_roles`
   only when `roleKeys` is present, hash a supplied password and set
   `updated_at`. Before making the target inactive or removing `admin`, check
   whether that user is the last active admin; if yes, abort with `409 last_admin`
   so the API cannot lock itself out of RBAC. Unknown users answer
   `404 user_not_found`; updates return `200` with the user summary.

6. `apps/api/src/index.ts`: register `adminUsersRoutes` with `{ database }` after
   the auth routes. The permission guard remains the only enforcement point.

7. Test (excluded from `files-write`):
   `apps/api/src/admin/__tests__/users.integration.spec.ts`. Migrate, seed RBAC,
   create admin and office sessions. Required cases: anonymous GET `401`, admin
   GET `200` hides hashes, office GET `200`, office POST `403`, admin POST creates
   a user with a role, duplicate e-mail `409 email_taken`, admin PATCH assigns a
   role, invalid body `400` with field paths, last active admin deactivation or
   un-role returns `409 last_admin`.

## Non-goals

- No role API, no role creation/editing and no permission checkbox endpoint
  (WP-M1-09b).
- No `usePermission`, no route protection and no admin UI pages (WP-M1-09c,
  WP-M1-09d).
- No audit event for user or role edits; that needs an audit table and is not in
  this slice.
- No password change endpoint for the current user, no session invalidation on
  user update, no user delete endpoint and no group membership management.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green. The new user API integration spec must run against a
reachable PostgreSQL 16 (`TEST_DATABASE_URL` or the CI service); if it skips,
the skip must be reported and a real database run is required before WP-M1-09
counts as done.

## Handoff

- Files changed: the four source files above, the integration spec and the bookkeeping outside `files-write`
- Interfaces added: shared user schemas, `adminUsersRoutes` and the user routes
- Deviation: PATCH always refreshes `updated_at`; password hashing happens before the transaction after body validation
- Verified: `npm run check` green against PostgreSQL 16 — 16 files, 104 tests,
  8 new admin-user cases
- Follow-up WP: WP-M1-09b (roles API), WP-M1-09c (`usePermission` and users UI), WP-M1-09d (roles UI)
- Open question: phase 1 needs a login form UI before the WP-M1-12 smoke test
