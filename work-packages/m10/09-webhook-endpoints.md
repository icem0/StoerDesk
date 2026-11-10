# WP-M10-09: Webhook endpoints, table and admin API

format: small-model
status: planned
depends-on: WP-M10-08
phase: 10
milestone: m10
context-budget: 18k tokens
spec: specs/08-objects-api.md §9.5; docs/DECISIONS/0013-external-api-keys-webhooks-openapi.md
spec-lines: 100

files-read:

- specs/08-objects-api.md (§9.5)
- apps/api/src/db/schema.ts
- apps/api/src/admin/api-keys.ts (route pattern)
- packages/shared/src/schemas/api-key.ts

files-write:

- apps/api/src/db/schema.ts
- apps/api/src/db/migrations/0027_webhooks.sql
- apps/api/src/webhooks/endpoints.ts
- packages/shared/src/schemas/webhook.ts

interfaces:

- `webhookEndpoints`, `webhookDeliveries` tables
- `GET/POST/PATCH/DELETE /api/v1/webhooks`
- `createWebhookRequestSchema`, `webhookSummarySchema`

## Task

1. Add the endpoint table (URL, secret, events, active) and the delivery table
   (endpoint, event id, event type, status, attempts, last status/duration)
   with a unique `(endpoint_id, event_id)`.
2. Add migration `0027_webhooks.sql`.
3. Add the admin CRUD routes guarded by `settings.read` / `settings.write`; the
   secret is returned only on create and never in the list.
4. Add the shared contracts and export them.

## Non-goals

- No delivery worker (WP-M10-10).
- No UI (WP-M10-11).
- No event creation in the ticket transaction.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; tests prove validation, secret-once and the event check.

## Handoff

- Files changed: the schema, the migration, the endpoint module and the shared
  contracts
- Interfaces added: webhook tables and `/api/v1/webhooks`
- Verified: the commands above
- Follow-up WP: WP-M10-10, WP-M10-11
- Open question: none
