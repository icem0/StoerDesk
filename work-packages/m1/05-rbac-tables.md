# WP-M1-05: RBAC tables and system role seed

format: small-model
depends-on: WP-M1-03
phase: 1
context-budget: 22k tokens
spec: specs/01-rbac.md §3.1–3.5, §4.1
spec-lines: 165

files-read:

- PLAN.md (§5, §6)
- specs/01-rbac.md
- packages/shared/src/permissions.ts
- apps/api/src/db/schema.ts
- apps/api/src/db/migrations/0000_base_tables.sql
- apps/api/src/db/**tests**/helpers/testDatabase.ts

files-write:

- packages/shared/src/permissions.ts
- apps/api/src/db/schema.ts
- apps/api/src/db/migrations/0001_rbac_tables.sql
- apps/api/src/db/seed-rbac.ts

interfaces:

- `PERMISSIONS.<category>.<key>`, `PERMISSION_KEYS: PermissionKey[]`,
  `SYSTEM_ROLE_KEYS`, `DEFAULT_ROLES: Record<SystemRoleKey, PermissionKey[]>`
- tables `roles`, `permissions`, `role_permissions`, `user_roles`, `user_permissions`
- `seedRbac(db): Promise<RbacSeedResult>` — run with `npx tsx src/db/seed-rbac.ts`

## Task

1. Expand `packages/shared/src/permissions.ts` to the 37-key catalog of
   `specs/01-rbac.md` §3.4 and add `SYSTEM_ROLE_KEYS` plus `DEFAULT_ROLES` with the
   matrix of §3.3. Keep the existing keys and their values unchanged.
2. Add the five tables of §4.1 to `apps/api/src/db/schema.ts`: UUID v7 defaults from
   `uuidDefault`, composite primary keys for the join tables, `check` for
   `user_permissions.effect` (`allow`/`deny`), unique keys for `roles.key` and
   `permissions.key`, index on `user_roles.role_id`, `onDelete: 'cascade'` on all FKs.
3. Generate the migration with `npm run db:generate -w @stoerdesk/api` and extend the
   generated SQL by the `protect_system_roles()` trigger described in §3.5
   (BEFORE DELETE, `RAISE EXCEPTION 'system_role_protected'` when
   `OLD.is_system`), created on `roles`.
4. Write `apps/api/src/db/seed-rbac.ts`: upsert every catalog key into
   `permissions`, upsert the five system roles with `is_system = true`, then for each
   system role delete `role_permissions` rows that are not in `DEFAULT_ROLES` and
   insert the wanted rows with `onConflictDoNothing`. Never touch non-system roles
   or `user_permissions`. `npx tsx src/db/seed-rbac.ts` runs it against
   `DATABASE_URL` and prints the counts.
5. Test `apps/api/src/db/__tests__/rbac.integration.spec.ts` (excluded from
   `files-write` per `PLAN.md` §17): after migrate + seed, 37 permissions and 5 roles
   exist, `admin` has `is_system = true` and every permission, the per-role counts
   match `DEFAULT_ROLES`, a second seed run changes nothing, deleting the `admin` role
   raises `P0001`, and a `deny` row in `user_permissions` is readable. Skipped when no
   database is reachable.

## Non-goals

- No login, no session handling (WP-M1-07) and no `requirePermission` guard
  (WP-M1-08) — the effective-permission resolution belongs there.
- No admin UI, no role audit events, no `api_keys` table, no object groups.
- No base seeds (admin user, objects, templates) — that is WP-M1-06.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

With a reachable database (`TEST_DATABASE_URL`) the new integration spec must run and
pass, including the second idempotent seed run. Without a database it is skipped and
the skip must be reported, not silently accepted: run the migration and
`npx tsx src/db/seed-rbac.ts` twice against a real PostgreSQL 16 and report both
outputs.

## Handoff

- Files changed: the four files above, plus the test file and the bookkeeping that
  stays outside `files-write` (`docs/REPO-MAP.md`, `AGENTS.md`, `CHANGELOG.md`,
  `work-packages/README.md`)
- Interfaces added: 37-key permission catalog, `DEFAULT_ROLES`, the five RBAC tables,
  `seedRbac()`
- Follow-up WP: WP-M1-06 base seeds (admin user needs Argon2id, not installed yet)
- Resolved: the legacy document's `object_groups` table is dropped — `PLAN.md` §6 has
  no object grouping and no work package asks for it
- Verified: report exactly which of the acceptance commands ran against a real
  database and which only skipped
