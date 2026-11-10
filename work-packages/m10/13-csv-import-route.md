# WP-M10-13: CSV import preview and commit routes

format: small-model
status: done
depends-on: WP-M10-12
phase: 10
milestone: m10
context-budget: 16k tokens
spec: specs/08-objects-api.md §9.4
spec-lines: 80

files-read:

- specs/08-objects-api.md (§9.4)
- apps/api/src/objects/import.ts
- apps/api/src/objects/service.ts (route pattern)
- apps/api/src/auth/requirePermission.ts

files-write:

- apps/api/src/objects/import-routes.ts
- apps/api/src/index.ts

interfaces:

- `POST /api/v1/objects/import/preview`
- `POST /api/v1/objects/import`

## Task

1. Add the preview route under `object.import`, mapping schema failures to
   `400 invalid_request` with `fields`.
2. Add the commit route with the `applied` counters.
3. Register the plugin and add integration tests for the limits, row errors,
   permission and idempotency.

## Non-goals

- No multipart upload.
- No UI.
- No import of systems.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; preview writes nothing, commit applies valid rows and an
unauthorised caller gets `403`.

## Handoff

- Files changed: the routes and the server registration
- Interfaces added: both import routes
- Verified: the commands above
- Follow-up WP: WP-M10-14
- Open question: none
