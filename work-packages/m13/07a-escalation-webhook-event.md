# WP-M13-07a: The webhook event type of the escalation

format: small-model
status: done
depends-on: WP-M13-06
phase: 13
milestone: m13
context-budget: 16k tokens
spec: specs/07-escalation.md §7.5
spec-lines: 40

files-read:

- specs/07-escalation.md §7.5
- packages/shared/src/schemas/webhook.ts (the event types)
- apps/api/src/db/schema.ts (the check of the delivery event type)
- apps/api/src/db/migrations/0027_webhooks.sql (the check in SQL)
- apps/api/src/db/migrations/meta/_journal.json

files-write:

- packages/shared/src/schemas/webhook.ts
- apps/api/src/db/schema.ts
- apps/api/src/db/migrations/0032_escalation_webhook_event.sql
- apps/api/src/db/migrations/meta/_journal.json

interfaces:

- `WEBHOOK_DELIVERY_EVENT_TYPES` — the two subscribed types and `ticket.escalated`
- `WebhookDeliveryEventType`
- the check `webhook_deliveries_event_type_check`

## Task

1. Add the event type `ticket.escalated` to the delivery contract: a delivery
   may carry it beside the two types an endpoint subscribes to.
2. Keep the subscription list of an endpoint untouched: the escalation
   delivers to the endpoints that its rule selected, so the admin page and the
   `webhook_endpoints_events_check` stay as they are.
3. Widen the check of the delivery event type in the schema and in the
   migration `0032_escalation_webhook_event.sql`; register the migration in the
   journal.

## Non-goals

- No dispatcher and no delivery row (WP-M13-07b).
- No change to the admin page of the webhooks and to its texts.
- No new signature, no new retry behaviour.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run wp:check
```

Expected: all green; the migration runs on a throwaway database and a delivery
row with the event type `ticket.escalated` is accepted.

## Handoff

- Files changed: the shared contract, the schema, the migration, the journal
- Interfaces added: `WEBHOOK_DELIVERY_EVENT_TYPES`, `WebhookDeliveryEventType`
- Verified: typecheck, lint, the migration on a throwaway database
- Follow-up WP: WP-M13-07b — the actions of a fired rule
- Open question: none
