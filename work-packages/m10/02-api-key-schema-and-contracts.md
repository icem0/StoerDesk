# WP-M10-02: API-key table, shared contracts and migration

format: small-model
status: done
depends-on: WP-M10-01
phase: 10
milestone: m10
context-budget: 18k tokens
spec: specs/08-objects-api.md §9.5; docs/DECISIONS/0013-external-api-keys-webhooks-openapi.md
spec-lines: 80

files-read:

- specs/08-objects-api.md (§9.5)
- docs/DECISIONS/0013-external-api-keys-webhooks-openapi.md
- apps/api/src/db/schema.ts (table conventions)
- packages/shared/src/schemas/object.ts (schema conventions)

files-write:

- apps/api/src/db/schema.ts
- apps/api/src/db/migrations/0026_api_keys.sql
- packages/shared/src/schemas/api-key.ts
- packages/shared/src/schemas/index.ts

interfaces:

- `apiKeyScopeSchema`, `apiKeySummarySchema`, `createApiKeyRequestSchema`, `updateApiKeyRequestSchema`, `createApiKeyResponseSchema`
- `apiKeys` table: hashed token, prefix, name, scopes, creator, last used, expiry, revocation
- migration `0026_api_keys`

## Task

1. Add the `apiKeys` table to `apps/api/src/db/schema.ts` with UUID v7 id,
   `token_hash` unique, `prefix`, `name`, `scopes text[]`, `created_by_user_id`,
   `last_used_at`, `expires_at`, `revoked_at`, timestamps and a scope check.
2. Add migration `0026_api_keys.sql` in the existing hand-written style.
3. Add `packages/shared/src/schemas/api-key.ts` with the four scopes
   (`objects:read`, `objects:write`, `tickets:read`, `tickets:write`), the
   summary without token/hash, create/update requests and the one-time
   create response.
4. Export the new schema module from `packages/shared/src/schemas/index.ts`.

## Non-goals

- No routes, no UI, no bearer authentication.
- No webhook table.
- No plaintext key storage.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the migration snapshot chain and the shared types compile.

## Handoff

- Files changed: the schema, the migration and the shared contract module
- Interfaces added: `api-key` schemas and the `api_keys` table
- Verified: the commands above
- Follow-up WP: WP-M10-03, WP-M10-05 (both files exist in this commit)
- Open question: none
