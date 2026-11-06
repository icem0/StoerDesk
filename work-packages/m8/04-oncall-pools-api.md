# WP-M8-04: on-call pool API

format: small-model
status: planned
depends-on: WP-M8-02
phase: 8
milestone: m8
context-budget: 17k tokens
spec: specs/04-oncall.md §4a.2, §4a.8
spec-lines: 60

files-read:

- specs/04-oncall.md (§4a.2 pools, §4a.8 API summary)
- apps/api/src/settings/branding.ts (route, guard and error pattern)
- apps/api/src/db/schema.ts (`oncallPools` from WP-M8-02)
- apps/api/src/auth/requirePermission.ts (`requirePermission` usage)
- packages/shared/src/schemas/index.ts (schema export bar)

files-write:

- apps/api/src/oncall/pools.ts
- packages/shared/src/schemas/oncall.ts
- packages/shared/src/schemas/index.ts
- apps/api/src/index.ts

interfaces:

- `createPoolRequestSchema`, `updatePoolRequestSchema`, `oncallPoolSchema`
- `GET /api/v1/oncall/pools` (`oncall.read`) — all pools with shift count
- `POST /api/v1/oncall/pools` (`oncall.admin`) — trimmed unique name, optional `groupId`
- `PATCH /api/v1/oncall/pools/:id` (`oncall.admin`) — rename, change group, set `active`
- `DELETE /api/v1/oncall/pools/:id` (`oncall.admin`) — only without shifts

## Task

1. Add the shared Zod schemas for a pool and its create/update bodies; names are
   trimmed and 1–100 characters, `groupId` is an optional UUID.
2. Implement `oncallPoolsRoutes` as a Fastify plugin guarded per route with
   `requirePermission` (`oncall.read` for list, `oncall.admin` for writes).
3. Enforce the case-insensitive unique name (`409 oncall_pool_name_taken`), the
   `409 oncall_pool_in_use` guard on delete while shifts exist, and the
   `404 oncall_pool_not_found` answer.
4. Register the plugin in `apps/api/src/index.ts`; the route prefix is
   `/api/v1/oncall`.
5. Add integration tests for the guards and the permission split.

## Non-goals

- No shift routes or planning service (WP-M8-05/06).
- No UI (WP-M8-13).
- No settings rows; the default pool key is WP-M8-10.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; tests use a real database or skip with a named reason.

## Handoff

- Files changed: the pool route plugin, the shared schemas and their export, the
  API registration, plus integration tests
- Interfaces added: the pool routes and schemas above
- Verified: typecheck, lint, test:run
- Follow-up WP: WP-M8-06 (shift routes) and WP-M8-13 (admin page)
- Open question: none
