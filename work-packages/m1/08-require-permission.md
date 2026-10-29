# WP-M1-08: Effective permissions and the requirePermission guard

format: small-model
depends-on: WP-M1-07b
phase: 1
context-budget: 26k tokens
spec: specs/01-rbac.md §3.2, §3.6, §3.7; PLAN.md §5 (Roles and permissions)
spec-lines: 45

files-read:

- specs/01-rbac.md (§3.2, §3.6, §3.7)
- apps/api/src/auth/sessionPlugin.ts
- apps/api/src/auth/session.ts
- apps/api/src/db/schema.ts
- packages/shared/src/permissions.ts
- apps/api/src/auth/routes.ts

files-write:

- apps/api/src/auth/requirePermission.ts
- apps/api/src/auth/routes.ts
- apps/api/src/index.ts
- packages/shared/src/schemas/auth.ts

interfaces:

- `loadEffectivePermissions(database, userId): Promise<PermissionKey[]>` — sorted
  catalog keys: role union + explicit allows − every explicit denial
- `effectivePermissions(request, database): Promise<PermissionKey[]>` — same
  resolution cached per request (`request.effectivePermissions`)
- `requirePermission(database, ...keys): preHandlerHookHandler` — OR semantics
- `permissionProbeRoutes` (fastify-plugin, opts `{ database }`) — test only
- error codes: `session_invalid` (`401`), `forbidden` (`403`)

## Task

Split note: the legacy package is rewritten here in the small-model format; the
scope stays the same (guard + effective permissions + `permissions` in `/me`).

1. `apps/api/src/auth/requirePermission.ts` (§3.7):
   - `loadEffectivePermissions`: two queries — the role union
     (`user_roles ⋈ roles ⋈ role_permissions ⋈ permissions`) and the
     `user_permissions` overrides of that user. Union of role keys and `allow`
     rows, then drop every key with a `deny` row (denial always wins, §3.2).
     Filter through `isPermissionKey` from `packages/shared` and return the keys
     sorted.
   - `effectivePermissions(request, database)`: caches the promise on
     `request.effectivePermissions` (module augmentation in this file), so
     several guards in one request mean one resolution, not one per query. No
     cache across requests — a role or permission change acts without a re-login.
   - `requirePermission(database, ...keys)`: preHandler factory. No
     `request.user` → `401 { code: 'session_invalid', params: {} }` (401 before
     403, §3.7). Otherwise `403 { code: 'forbidden', params: {} }` unless at
     least one of `keys` is held.
   - `permissionProbeRoutes`: fastify-plugin registering
     `GET /api/v1/_test/require-permission/:keys` where `:keys` is a
     comma-separated list, guarded by `requirePermission(database, ...list)` and
     answering `200 { allowed: true }`. An empty list never matches.
2. `packages/shared/src/schemas/auth.ts`: `meResponseSchema.user` gains
   `permissions: z.array(z.string().min(1))`, sorted keys, still no text.
3. `apps/api/src/auth/routes.ts`: `GET /api/v1/me` uses
   `effectivePermissions(request, database)` and replies
   `{ user: { id, email, locale, roles, permissions } }`.
4. `apps/api/src/index.ts`: after `authRoutes`, register `permissionProbeRoutes`
   with `{ database }` only when `env.NODE_ENV === 'test'`.

## Non-goals

- No user/role/permission admin UI and no service guards for role edits
  (WP-M1-09), no audit event for permission changes.
- No `usePermission` hook and no UI hiding in `apps/web` (WP-M1-09), no API keys
  (phase 10), no group-based permissions, no SQL view.
- No cache across requests and no cache invalidation events.
- No CSRF token, no OpenAPI / type-provider wiring (phase 10).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green. The required cases (integration spec, skipped without a
reachable database — say so) are: anonymous probe `401` `session_invalid`; user
with role `admin` `200` for `user.write`; user without any role `403`
`forbidden`; OR semantics — a user holding only `ticket.read` gets `200` for
`user.write,ticket.read` and `403` for `user.write,role.write`. Additionally:
an explicit `deny` beats the `admin` role union, and `/me` lists the sorted
`permissions` of a role user.

## Handoff

- Files changed: the four files above plus `apps/api/src/auth/__tests__/`
  requirePermission integration spec and the bookkeeping outside `files-write`
  (`docs/REPO-MAP.md`, `AGENTS.md`, `CHANGELOG.md`, `work-packages/README.md`)
- Interfaces added: as listed above
- Deviation: (fill in after implementation)
- Verified: (fill in — database available or tests skipped)
- Follow-up WP: WP-M1-09 (admin UI users and roles) uses `requirePermission` on
  every route it adds
