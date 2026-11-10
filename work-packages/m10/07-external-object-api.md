# WP-M10-07: External object API with updated-since, upsert and bulk

format: small-model
status: planned
depends-on: WP-M10-05
phase: 10
milestone: m10
context-budget: 20k tokens
spec: specs/08-objects-api.md §9.5
spec-lines: 120

files-read:

- specs/08-objects-api.md (§9.1, §9.5)
- apps/api/src/objects/service.ts
- packages/shared/src/schemas/object.ts
- apps/api/src/auth/apiKeyPlugin.ts

files-write:

- apps/api/src/objects/service.ts
- packages/shared/src/schemas/object.ts
- apps/api/src/objects/external.ts

interfaces:

- `GET /api/v1/objects?updated_since=&active=&limit=`
- `PUT /api/v1/objects/:objectNo`
- `POST /api/v1/objects/bulk`
- `DELETE /api/v1/objects/:objectNo` with `objects:write`

## Task

1. Extend the object list query with `updated_since` and `limit`; order by
   `updatedAt` when `updated_since` is present.
2. Add `PUT` upsert and `POST /bulk` with per-item results; a bulk error never
   rolls back the other items.
3. Guard the external routes with `requireScopeOrPermission` so the session path
   keeps `object.read`/`object.write`/`object.delete`.
4. Add the shared request/response schemas and tests for invalid timestamps,
   upsert create/update, bulk partial failure and soft delete.

## Non-goals

- No CSV import.
- No ticket routes.
- No change to the QR or BMAcloud ownership rules.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; API-key and session callers both pass, a missing scope
answers `403`, invalid payloads `422`.

## Handoff

- Files changed: the object service, the shared schemas and the external module
- Interfaces added: the external object endpoints
- Verified: the commands above
- Follow-up WP: WP-M10-08
- Open question: none
