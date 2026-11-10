# WP-M10-10: Webhook delivery worker with HMAC and backoff

format: small-model
status: planned
depends-on: WP-M10-09
phase: 10
milestone: m10
context-budget: 20k tokens
spec: specs/08-objects-api.md §9.5; docs/DECISIONS/0013-external-api-keys-webhooks-openapi.md
spec-lines: 100

files-read:

- specs/08-objects-api.md (§9.5)
- apps/api/src/webhooks/endpoints.ts
- apps/api/src/db/schema.ts
- apps/api/src/jobs/qr-cleanup.ts (job pattern)

files-write:

- apps/api/src/webhooks/delivery.ts
- apps/api/src/jobs/webhooks.ts
- apps/api/src/index.ts

interfaces:

- `collectPendingWebhooks(database, now)`
- `deliverWebhook(...)`, `signWebhook(secret, timestamp, body)`
- pg-boss queue `webhook-delivery`, one run per minute

## Task

1. Scan `ticket_events` for `created` and status-changing events and insert one
   delivery row per active subscribed endpoint; the unique key makes the scan
   idempotent.
2. Send with `fetch` and the signature headers; treat non-2xx, timeout and
   network errors as failures.
3. Retry with 1, 5, 25, 125 s backoff and mark the delivery `FAILED` after five
   attempts. Log status and duration only.
4. Start the worker only in the direct API start, like the other jobs.

## Non-goals

- No changes to `tickets/workflow.ts`.
- No UI.
- No encryption of the stored secret.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; a fake endpoint proves the signature, the retry sequence
and the terminal failed state without leaking the secret.

## Handoff

- Files changed: the delivery service, the job and the server start
- Interfaces added: the webhook delivery worker
- Verified: the commands above
- Follow-up WP: WP-M10-11
- Open question: none
