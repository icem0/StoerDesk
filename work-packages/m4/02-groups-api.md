# WP-M4-02: Groups administration API (server)

format: small-model
status: planned
depends-on: WP-M1-05
phase: 4
context-budget: 18k tokens
spec: PLAN.md §6 (data model: `groups`, `user_groups`), PLAN.md §14 (settings: users, groups)
spec-lines: 40

files-read:

- apps/api/src/admin/users.ts — CRUD route pattern, error envelope, transactional writes
- apps/api/src/admin/roles.ts — route pattern, catalog validation, 409 guards
- packages/shared/src/schemas/user.ts — shared schema pattern
- apps/api/src/index.ts — route registration

files-write:

- packages/shared/src/schemas/group.ts
- apps/api/src/admin/groups.ts
- packages/shared/src/schemas/index.ts
- apps/api/src/index.ts

interfaces:

- `GET /api/v1/groups` — list groups with member count, guard `user.read`
- `POST /api/v1/groups` — create a group, guard `user.write`
- `PATCH /api/v1/groups/:id` — rename a group, guard `user.write`
- `DELETE /api/v1/groups/:id` — delete a group, `409 group_in_use` while users belong to it, guard `user.write`

## Task

1. `packages/shared/src/schemas/group.ts`: add `groupSummarySchema`, `groupListResponseSchema`, `createGroupRequestSchema`, `updateGroupRequestSchema` and exported types; group identity is the UUID `id`, the editable field is `name` (1–120 chars, trimmed).
2. `apps/api/src/admin/groups.ts`: register `adminGroupsRoutes` (`GET`, `POST`, `PATCH /:id`, `DELETE /:id`) under `/api/v1/groups`, guarded by `user.read` / `user.write`, resolving membership through the existing `userGroups` table; `DELETE` answers `409 group_in_use` while membership rows exist.
3. `packages/shared/src/schemas/index.ts`: export the new group schemas.
4. `apps/api/src/index.ts`: import and register `adminGroupsRoutes` next to `adminUsersRoutes` / `adminRolesRoutes`.

## Non-goals

- No user-group membership endpoints in this WP (members are implied by `userGroups`; a later WP exposes add/remove member).
- No UI, no i18n keys beyond shared schemas.
- No migration: the `groups` and `user_groups` tables already exist in migration `0000_base_tables`.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run wp:check
```

Expected: all green.

## Handoff

- Files changed: `packages/shared/src/schemas/group.ts` (new), `apps/api/src/admin/groups.ts` (new), `packages/shared/src/schemas/index.ts` (edit), `apps/api/src/index.ts` (edit).
- Interfaces added: `adminGroupsRoutes` — `GET`/`POST`/`PATCH`/`DELETE /api/v1/groups`.
- Verified: `npm run typecheck`, `npm run lint`, `npm run wp:check` green (DB-dependent tests skip without PostgreSQL).
- Follow-up WP: WP-M4-03 groups UI (web), WP-M4-04 groups admin-home link.
- Open question: none.
