# WP-M2-01: Object list CRUD API

format: small-model
status: implemented
depends-on: WP-M2-00
phase: 2
context-budget: 26k tokens
spec: specs/08-objects-api.md §9.1, specs/02-data-model.md §4.3–§4.4
spec-lines: 95

files-read:

- specs/08-objects-api.md (§9.1 object list API)
- specs/02-data-model.md (§4.3 objects, §4.3.1 object_no, §4.4 systems)
- apps/api/src/admin/roles.ts (route/guard/error pattern)
- apps/api/src/db/schema.ts (`objects`, `systems`, `SYSTEM_TYPES`)
- packages/shared/src/permissions.ts (`PERMISSIONS.object.*`)
- packages/shared/src/schemas/user.ts (schema style)

files-write:

- packages/shared/src/schemas/object.ts
- packages/shared/src/schemas/index.ts
- apps/api/src/objects/service.ts
- apps/api/src/index.ts

interfaces:

- shared `objectSummarySchema`, `objectListResponseSchema`,
  `objectListQuerySchema`, `createObjectRequestSchema`,
  `updateObjectRequestSchema`, `objectSystemInputSchema`
- `objectRoutes` (fastify-plugin, opts `{ database }`) with `GET`, `GET /:objectNo`,
  `POST`, `PATCH /:objectNo` and `DELETE /:objectNo` under `/api/v1/objects`
- service functions `listObjects`, `getObject`, `createObject`, `updateObject`,
  `softDeleteObject`
- error codes: `session_invalid` (`401`), `forbidden` (`403`),
  `invalid_request` (`400`), `object_not_found` (`404`), `object_no_taken` (`422`)

## Task

The tables from WP-M2-00 exist; this package adds the first HTTP surface of the
object list. Route and service share one module, staying inside `PLAN.md` §17.

1. `packages/shared/src/schemas/object.ts`: `objectSystemTypeSchema` over the six
   types; `objectNoSchema` trims, upper-cases and enforces
   `^[A-Z0-9][A-Z0-9_-]{0,31}$`; optional text fields turn `''` into `null`;
   `contactEmail` additionally passes `z.email()`. Define the system input
   (`id` optional, `type`, `label`), object summary with `systems`, list
   response, list query (`search`, `active` = `true|false|all` default `true`,
   `city`, `systemType`) and create/update requests. Export from the schemas
   index.
2. `apps/api/src/objects/service.ts` — service part: `listObjects` builds a
   Drizzle `where` from the query (case-insensitive contains search over
   `object_no`, `name`, `street`, `city`, `external_id`; `active` filter; exact
   city filter; `systemType` through an `exists` subquery on `systems`), orders
   by `object_no`, loads all systems of the result set and parses the summaries.
   `getObject` looks up by `lower(object_no)` and returns the summary or throws
   `ObjectRouteError(404, 'object_not_found')`.

3. Service part, writes: `createObject` inserts the object plus its systems in
   one transaction (201 summary; a `23505` unique violation becomes
   `422 object_no_taken`). `updateObject` updates only the submitted object
   fields, syncs the submitted `systems` set by id (update existing, insert new,
   delete absent, an unknown id is `400 invalid_request`), refreshes
   `updated_at` and answers the summary. `softDeleteObject` sets
   `active = false`, refreshes `updated_at` and keeps rows and systems.

4. `apps/api/src/objects/service.ts` — route part: `objectRoutes` fastify-plugin
   taking `{ database }`. Parse bodies, queries and `:objectNo` with the shared
   schemas; malformed input answers `400 invalid_request` with field paths only.
   Guards: `object.read` for both GET routes, `object.write` for POST/PATCH,
   `object.delete` for DELETE. Responses are `{ objects }`, a bare summary or
   `204`, exactly as `specs/08-objects-api.md` §9.1 says.

5. `apps/api/src/index.ts`: register `objectRoutes` with `{ database }` after
   `adminRolesRoutes`.

6. Integration test (excluded from `files-write`):
   `apps/api/src/objects/__tests__/objects.integration.spec.ts` — migrate,
   `seedRbac`, sessions for an administrator, an `office` user (write, no delete)
   and a `reporter_internal` user (read only). Six cases: anonymous `401`;
   reporter create `403` and office delete `403`; create with systems, detail and
   PATCH (object fields and the systems set); duplicate `object_no` differing
   only in case `422 object_no_taken`; search/city/systemType filters; soft
   delete `204`, `active = false` in the database, hidden from the default list
   and visible with `active=all`, unknown object `404`. Skipped without a
   reachable database.

## Non-goals

- No QR generation, regeneration or `old_qr_tokens` (WP-M2-02), no sticker/PDF
  (WP-M2-03), no CSV import and no external API keys.
- No migration and no schema change: the tables of migration
  `0002_core_object_tables` are used as they are.
- No object UI, no object picker, no ticket history and no statistics.
- No hard delete, no restore endpoint and no audit trail.
- No change to `seed-demo.ts` and no new permission keys.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green against a reachable PostgreSQL 16 (`TEST_DATABASE_URL` or the
CI service); a skipped spec is reported and re-run on a database.

## Handoff

- Files changed: the four source files, the integration spec and the bookkeeping
  (`specs/08-objects-api.md`, `CHANGELOG.md`, `AGENTS.md`, `PLAN.md` §16, `docs/REPO-MAP.md`,
  `work-packages/README.md`)
- Interfaces added: shared object schemas, `objectRoutes`, the five object routes
- Verified: `npm run check` green; the six new object cases pass on PostgreSQL 16
- Follow-up WP: WP-M2-02 fills `objects.qr_token` and adds regeneration
