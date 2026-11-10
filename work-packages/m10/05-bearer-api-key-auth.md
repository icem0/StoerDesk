# WP-M10-05: Bearer API-key authentication and scope guard

format: small-model
status: planned
depends-on: WP-M10-03
phase: 10
milestone: m10
context-budget: 18k tokens
spec: specs/08-objects-api.md §9.5; docs/DECISIONS/0013-external-api-keys-webhooks-openapi.md
spec-lines: 80

files-read:

- specs/08-objects-api.md (§9.5)
- apps/api/src/auth/api-keys.ts
- apps/api/src/auth/requirePermission.ts
- apps/api/src/auth/sessionPlugin.ts

files-write:

- apps/api/src/auth/apiKeyPlugin.ts
- apps/api/src/auth/requirePermission.ts
- apps/api/src/index.ts

interfaces:

- request decoration `request.apiKey = { id, scopes }`
- `requireScopeOrPermission(database, scope, permission)` preHandler

## Task

1. Add `apiKeyPlugin`: parse `Authorization: Bearer sk_...`, verify through the
   service, reject revoked/expired keys with `401 api_key_invalid`, and set the
   request api-key context without touching `request.user`.
2. Add a dual guard that accepts a session with the permission or a key with the
   scope; a key without the scope answers `403 forbidden`.
3. Register the plugin before the routes and keep the existing session plugin.
4. Do not log the header or the token.

## Non-goals

- No external routes yet.
- No change to the session cookie or RBAC matrix.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; tests prove valid/invalid/expired/revoked keys, missing
scope and the session path.

## Handoff

- Files changed: the plugin, the guard and the server registration
- Interfaces added: `request.apiKey`, `requireScopeOrPermission`
- Verified: the commands above
- Follow-up WP: WP-M10-06, WP-M10-07, WP-M10-08
- Open question: none
