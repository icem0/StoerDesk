# WP-M13-07: The actions of a fired rule

format: small-model
status: planned
depends-on: WP-M13-05, WP-M13-06
phase: 13
milestone: m13
context-budget: 24k tokens
spec: specs/07-escalation.md §7.5, §7.7
spec-lines: 60

files-read:

- specs/07-escalation.md §7.5, §7.7
- apps/api/src/notifications/outbox.ts (the outbox rows)
- apps/api/src/webhooks/delivery.ts (the delivery rows and the payload)
- apps/api/src/db/schema.ts (the check of the webhook event types)
- packages/shared/src/schemas/webhook.ts (the event types)

files-write:

- apps/api/src/escalation/actions.ts
- packages/shared/src/schemas/webhook.ts
- apps/api/src/db/schema.ts
- apps/api/src/escalation/__tests__/actions.integration.spec.ts

interfaces:

- `dispatchEscalationActions(database, firing, facts): Promise<{ notified: number, webhooks: number, notes: number }>`
- the webhook event type `ticket.escalated`
- the ticket event `escalation_note` with the payload `{ rule, stage, text }`

## Task

1. Dispatch the actions of a fired rule: the condition of every action decides
   whether it runs.
2. `notify`: write one outbox row per selected channel with the machine-readable
   parameters of the ticket, the rule and the stage; the outbox worker delivers
   them with its retry and its fallback chain.
3. `webhook`: write one delivery row per selected endpoint with the event type
   `ticket.escalated`; the webhook worker sends them with the HMAC signature and
   the backoff. The migration of the check constraint belongs to this package.
4. `history`: write one append-only `escalation_note` event with the configured
   text.

## Non-goals

- No action changes a ticket.
- No new channel adapter, no new webhook delivery mechanism.
- No in-app notification inbox.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run test:run -- apps/api/src/escalation/__tests__/actions.integration.spec.ts
npm run wp:check
```

Expected: all green; the test proves the three action types and the condition
that skips an action.

## Handoff

- Files changed: the dispatcher, the webhook contract, the schema, the test
- Interfaces added: the dispatcher and the two event types
- Verified: typecheck, the integration test
- Follow-up WP: WP-M13-08 — the reachable stages of a ticket
- Open question: none
