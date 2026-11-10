# WP-M10-03: Admin API-key routes and hashing service

format: small-model
status: done
depends-on: WP-M10-02
phase: 10
milestone: m10
context-budget: 18k tokens
spec: specs/08-objects-api.md §9.5; docs/DECISIONS/0013-external-api-keys-webhooks-openapi.md
spec-lines: 80

files-read:

- specs/08-objects-api.md (§9.5)
- packages/shared/src/schemas/api-key.ts
- apps/api/src/admin/roles.ts (route pattern)
- apps/api/src/auth/requirePermission.ts

files-write:

- apps/api/src/auth/api-keys.ts
- apps/api/src/admin/api-keys.ts
- apps/api/src/index.ts

interfaces:

- `generateApiKey()`, `hashApiKey(token)`, `listApiKeys`, `createApiKey`, `updateApiKey`, `revokeApiKey`
- `GET/POST /api/v1/api-keys`, `PATCH/DELETE /api/v1/api-keys/:id`

## Task

1. Implement `apps/api/src/auth/api-keys.ts`: generate `sk_` plus 32 random
   bytes base64url, hash with SHA-256, create/update/revoke/list without ever
   returning the hash, and set `last_used_at` through a reusable verifier for
   WP-M10-05.
2. Implement `apps/api/src/admin/api-keys.ts` with the four session-only routes
   guarded by `apikey.read` / `apikey.write`. Invalid ids answer `404
   api_key_not_found`; malformed bodies `400 invalid_request`.
3. Register the plugin in `apps/api/src/index.ts`.

## Non-goals

- No bearer authentication of external routes (WP-M10-05).
- No admin UI (WP-M10-04).
- No webhook routes.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; an integration test proves the token is shown once, the
list omits it and a revoked key cannot verify.

## Handoff

- Files changed: the service, the admin routes and the server registration
- Interfaces added: `api-keys` service and `/api/v1/api-keys`
- Verified: the commands above
- Follow-up WP: WP-M10-04, WP-M10-05
- Open question: none
