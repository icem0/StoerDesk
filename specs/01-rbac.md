# 01 — RBAC (roles and permissions)

**Chapter:** 3 + 4.1
**Scope:** ~200 lines
**Status:** taken from `PLAN.md` §5/§6 and reviewed for WP-M1-05; §3.6 from
`PLAN.md` §4/§15 and reviewed for WP-M1-07

> The source of this slice is `PLAN.md` §5 (roles, permission categories) and §6
> (tables); §3.6 comes from `PLAN.md` §4 (Auth) and §15 (Security). Chapter
> numbers stay stable. Details that `PLAN.md` settled are marked **(plan)**.

## 3 — Roles and permissions

### 3.1 Roles

`reporter_anon` is **not** a database role; it is the public capability of the
report form (`/m/<qr_token>`). Authenticated users hold exactly one of five roles:

| Role                | Purpose                                                              |
| ------------------- | -------------------------------------------------------------------- |
| `reporter_internal` | Facility staff; creates reports, sees own tickets                    |
| `office`            | Reviews tickets, sets AA/SA, distributes, closes, maintains objects  |
| `oncall`            | Accepts, declines and acknowledges assigned or offered tickets       |
| `manager`           | Read access to everything, statistics, export, escalation oversight  |
| `admin`             | Users, roles, groups, settings, on-call planning, channels, API keys |

All five are **system roles** (`roles.is_system = true`). They are created by the
seed from `packages/shared/src/permissions.ts`, cannot be deleted, and their
permission set is rewritten on every seed run. Custom (non-system) roles are never
created or changed by the seed; they arrive through the role API (§3.8). **(plan)**

### 3.2 Permission model

- Permission keys are constants in `packages/shared/src/permissions.ts` — the
  single source of truth, type-checked through `PermissionKey`.
- Effective permissions of a user: the **union of the role permissions**, plus
  explicit allows from `user_permissions`, minus explicit **denials** from
  `user_permissions`. A denial always wins. **(plan)**
- The only enforcement point is the server: the Fastify `preHandler`
  `requirePermission(...keys)` with OR semantics; without a match it returns
  `403` with the error code `forbidden`. The UI only hides actions through
  `usePermission`.
- Session and role data are read from the database per request, so a permission
  change takes effect without a new login.
- Permissions are transferred as keys, never as translated text.

### 3.3 Role–permission matrix

Short names: `ri` = `reporter_internal`, `of` = `office`, `oc` = `oncall`,
`mg` = `manager`, `ad` = `admin`. `ad` holds **every** permission.

| Key                    | ri  | of  | oc  | mg  | ad  |
| ---------------------- | --- | --- | --- | --- | --- |
| `ticket.read`          | x   | x   | x   | x   | x   |
| `ticket.create`        | x   | x   |     |     | x   |
| `ticket.review`        |     | x   |     |     | x   |
| `ticket.assign`        |     | x   |     |     | x   |
| `ticket.offer`         |     | x   |     |     | x   |
| `ticket.claim`         |     |     | x   |     | x   |
| `ticket.accept`        |     |     | x   |     | x   |
| `ticket.decline`       |     |     | x   |     | x   |
| `ticket.acknowledge`   |     |     | x   |     | x   |
| `ticket.close`         |     | x   |     |     | x   |
| `ticket.reopen`        |     | x   |     | x   | x   |
| `ticket.cancel`        |     | x   |     |     | x   |
| `ticket.comment`       | x   | x   | x   | x   | x   |
| `ticket.photo.read`    | x   | x   | x   | x   | x   |
| `ticket.photo.write`   | x   | x   | x   |     | x   |
| `object.read`          | x   | x   | x   | x   | x   |
| `object.write`         |     | x   |     |     | x   |
| `object.import`        |     | x   |     |     | x   |
| `object.delete`        |     |     |     |     | x   |
| `object.regenerate_qr` |     |     |     |     | x   |
| `oncall.read`          |     | x   | x   | x   | x   |
| `oncall.confirm`       |     |     | x   |     | x   |
| `oncall.swap`          |     |     | x   |     | x   |
| `oncall.plan`          |     |     |     |     | x   |
| `oncall.admin`         |     |     |     |     | x   |
| `user.read`            |     | x   |     | x   | x   |
| `user.write`           |     |     |     |     | x   |
| `role.read`            |     |     |     |     | x   |
| `role.write`           |     |     |     |     | x   |
| `settings.read`        |     | x   | x   | x   | x   |
| `settings.write`       |     |     |     |     | x   |
| `apikey.read`          |     |     |     |     | x   |
| `apikey.write`         |     |     |     |     | x   |
| `stats.read`           |     |     |     | x   | x   |
| `stats.export`         |     |     |     | x   | x   |
| `notification.read`    | x   | x   | x   | x   | x   |
| `notification.write`   | x   | x   | x   | x   | x   |

Totals: 37 keys — `ri` 8, `of` 19, `oc` 15, `mg` 12, `ad` 37.

Assignments beyond the wording of `PLAN.md` §5, decided in this review **(plan)**:

- `notification.read` / `notification.write` cover the **user's own** channel
  configuration (§12: users pick channels per event type). Mandatory minimum
  channels for `critical` are a setting, not a separate permission.
- `settings.read` is needed by roles that display deadline and on-call values
  (dashboard, ticket detail, calendar) without being allowed to change them.
- `object.delete` and `object.regenerate_qr` stay with the admin (§11: token
  regeneration is an admin decision); `office` maintains and imports objects
  (§5: "maintains objects").
- `ticket.photo.write` belongs to reporting and to acknowledging; `manager` is
  read-only apart from `ticket.reopen` (§7 rule 9).

### 3.4 Permission catalog

Catalog in `packages/shared/src/permissions.ts`, grouped by category; the value is
the key (multi-word keys use `snake_case`, for example `object.regenerate_qr`):

```
ticket.read, ticket.create, ticket.review, ticket.assign, ticket.offer,
ticket.claim, ticket.accept, ticket.decline, ticket.acknowledge, ticket.close,
ticket.reopen, ticket.cancel, ticket.comment, ticket.photo.read,
ticket.photo.write
object.read, object.write, object.delete, object.regenerate_qr, object.import
oncall.read, oncall.plan, oncall.confirm, oncall.swap, oncall.admin
user.read, user.write
role.read, role.write
settings.read, settings.write
apikey.read, apikey.write
stats.read, stats.export
notification.read, notification.write
```

This catalog is the only place where keys are added. `DEFAULT_ROLES` in the same
file assigns the permissions to the five system roles, so the database seed, the
API guard and the UI all read the **same** source.

### 3.5 Seed and protection

- `apps/api/src/db/seed-rbac.ts` is idempotent: roles and permissions are
  upserted; `role_permissions` of system roles are cleared and rewritten. Running
  the seed twice changes nothing.
- Custom (non-system) roles and all `user_permissions` rows are never touched by
  the seed.
- A database trigger blocks `DELETE` on roles with `is_system = true`, so `admin`
  cannot be lost: the trigger raises the message `system_role_protected`
  (SQLSTATE `P0001`). The service-level guards are part of the role API (§3.8).
- Role changes are not audited in phase 1; an audit event for role and permission
  edits arrives with the admin UI (WP-M1-09).

### 3.6 Session and the `me` endpoint

Reviewed for WP-M1-07, taken from `PLAN.md` §4 (Auth) and §15 (Security).

| Concern               | Decision                                                                                                                                                                                                             |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cookie                | name `session`, value = 256-bit random token (base64url), `httpOnly`, `SameSite` from `COOKIE_SAME_SITE` (default `lax`), `Secure` from `COOKIE_SECURE`, `Path=/`, `Max-Age` = `SESSION_TTL_HOURS`                   |
| `sessions.token_hash` | SHA-256 of the token as hex — the token itself is never stored, the unique index makes a stolen row unusable as a cookie **(plan)**                                                                                  |
| Cookie signature      | none: the database lookup is authoritative, `SESSION_SECRET` is not used by sessions                                                                                                                                 |
| Login                 | e-mail trimmed and lower case (as in the base seed), `verifyPassword`; unknown e-mail, wrong password and `active = false` all answer the same `401` with `{ code: 'invalid_credentials' }` — no account enumeration |
| Rate limit            | login route: 5 requests per minute per IP, then `429` (`PLAN.md` §15)                                                                                                                                                |
| `loadSession`         | one query over `sessions ⋈ users` filtered by token hash and `expires_at > now`; expired rows are deleted on read; inactive users count as no session → `401` with `{ code: 'session_invalid' }`                     |
| `request.user`        | set per request by the session plugin: `{ id, email, locale, roles }` (role keys, read from the database every request, see §3.2); otherwise unset                                                                   |
| `GET /api/v1/me`      | `200` with `{ user: { id, email, locale, roles } }`, never translated text                                                                                                                                           |
| Effective permissions | resolved by the service function of WP-M1-08 (§3.2); `/me` gains the `permissions` array with that package                                                                                                           |
| Logout                | deletes the session row, clears the cookie, answers `204` also without a session                                                                                                                                     |
| CSRF                  | phase 1 relies on `SameSite=Lax` plus the JSON-only API (`PLAN.md` §15); token-based CSRF stays an open decision                                                                                                     |
| Session cleanup       | expired rows are removed on read; a scheduled purge job arrives with the pg-boss jobs package                                                                                                                        |

### 3.7 Permission guard

Reviewed for WP-M1-08, taken from §3.2 and `PLAN.md` §5.

| Concern           | Decision                                                                                                                                                                                                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Service function  | `loadEffectivePermissions(database, userId)` — union of the role permissions plus explicit `allow` rows, minus every explicit `deny` row; returns sorted catalog keys (`PermissionKey[]`), never text. Two queries: role union, then the `user_permissions` overrides **(plan)** |
| Per-request cache | the promise is cached on the request (`request.effectivePermissions`), so several guards in one request resolve once, not once per query; no cross-request cache — a change acts without a new login (§3.2)                                                                      |
| Guard             | `requirePermission(database, ...keys)` preHandler with OR semantics; anonymous → `401 { code: 'session_invalid' }`, no match → `403 { code: 'forbidden', params: {} }`                                                                                                           |
| `GET /api/v1/me`  | gains `permissions` (the sorted effective keys) next to `roles`, still no translated text; the login answer uses the same schema, so it carries them too **(plan)**                                                                                                              |
| Probe route       | `GET /api/v1/_test/require-permission/:keys` (comma-separated keys) registered only when `NODE_ENV=test`, so the guard is testable over HTTP; never registered in `development` or `production` **(plan)**                                                                       |
| UI side           | `usePermission` reads the `permissions` array of `/me`; hiding is cosmetic, the server stays the only enforcement point (§3.2)                                                                                                                                                   |

### 3.8 Role API

Reviewed for WP-M1-09b, taken from §3.1, §3.4, §3.5 and `PLAN.md` §16. The role API
is the only runtime path that creates or changes roles; the seed stays the authority
for the five system roles (§3.1, §3.5).

| Concern                             | Decision                                                                                                                                                                                                                                                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity                            | `roles.key` addresses a role in routes and payloads — keys are unique (§4.1) and are what the seed, the guard and the UI use; the UUID stays internal **(plan)**                                                                                                                                           |
| `GET /api/v1/roles` (`role.read`)   | all roles ordered by key with `key`, `isSystem`, the sorted `permissionKeys` and `userCount` (holders from `user_roles`); keys only, never translated text **(plan)**                                                                                                                                      |
| `POST /api/v1/roles` (`role.write`) | creates a **custom** role (`is_system = false`): `key` matches `^[a-z][a-z0-9_]{1,63}$`, `permissionKeys` de-duplicated; an existing or reserved key answers `409 { code: 'role_key_taken' }`; `201` with the role summary **(plan)**                                                                      |
| Permission validation               | every key must be in the catalog (`isPermissionKey`, §3.4) before anything is written: `422 { code: 'unknown_permission_key', params: { fields: ['permissionKeys'], permissionKeys } }` **(plan)**                                                                                                         |
| `PATCH /api/v1/roles/:key`          | replaces `permissionKeys` when supplied; `key` and `isSystem` are immutable; a system role answers `409 { code: 'system_role_protected' }` because its grant set is rewritten by every seed run (§3.1), an unknown role `404 { code: 'role_not_found' }` **(plan)**                                        |
| `DELETE /api/v1/roles/:key`         | custom roles only — system roles `409 system_role_protected` (the service guard of §3.5, the `protect_system_roles` trigger stays the backstop), a role still held by users `409 { code: 'role_in_use', params: { fields: ['key'], userCount } }`; success `204` and `role_permissions` cascade **(plan)** |
| Effect                              | grants are resolved per request (§3.2), so a changed role acts on the next request without a new login — asserted through `GET /api/v1/me` **(plan)**                                                                                                                                                      |
| Body and path errors                | parsed manually like the user API: `400 { code: 'invalid_request', params: { fields } }` with field paths, never e-mail addresses or secrets **(plan)**                                                                                                                                                    |

Out of scope: per-user `user_permissions` overrides over HTTP (the table stays
seed-only), role renames, role copying and any audit trail (§3.5).

## 4.1 — Tables (RBAC)

All tables use UUID v7 primary keys (ADR-0002) and UTC timestamps; join tables use
composite keys.

| Table              | Columns                                                       | Notes                                     |
| ------------------ | ------------------------------------------------------------- | ----------------------------------------- |
| `roles`            | `id`, `key` (unique), `is_system`, `created_at`, `updated_at` | five system roles from the seed           |
| `permissions`      | `id`, `key` (unique), `created_at`                            | catalog, 37 rows                          |
| `role_permissions` | `role_id`, `permission_id`, `created_at`                      | composite PK, FK `cascade`                |
| `user_roles`       | `user_id`, `role_id`, `created_at`                            | composite PK, index on `role_id`          |
| `user_permissions` | `user_id`, `permission_id`, `effect`, `created_at`            | `effect IN ('allow','deny')`, denial wins |

Out of scope for WP-M1-05: `api_keys` (phase 10), object groups (no work package),
role change history, group-based permissions.

Effective rights are resolved by a SQL view or a service function in WP-M1-08
(`requirePermission`), not enforced by the schema.
