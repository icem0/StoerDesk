# WP-M13-07b: The actions of a fired rule

format: small-model
status: done
depends-on: WP-M13-07a, WP-M13-05
phase: 13
milestone: m13
context-budget: 24k tokens
spec: specs/07-escalation.md §7.5, §7.7
spec-lines: 60

files-read:

- specs/07-escalation.md §7.5, §7.7
- apps/api/src/notifications/outbox.ts (the outbox rows)
- apps/api/src/webhooks/delivery.ts (the delivery rows and the payload)
- apps/api/src/tickets/escalation.ts (the scan that fires a rule)
- apps/api/src/escalation/config.ts (the actions of the configuration)

files-write:

- apps/api/src/escalation/actions.ts
- apps/api/src/tickets/escalation.ts
- apps/api/src/webhooks/delivery.ts
- apps/api/src/escalation/__tests__/actions.integration.spec.ts

interfaces:

- `dispatchEscalationActions(database, firing, facts): Promise<{ notified, webhooks, notes }>`
- the ticket event `escalation_note` with the payload `{ rule, stage, text }`
- the delivery of the webhook event type `ticket.escalated`

## Task

1. Dispatch the actions of a fired rule: the condition of every action decides
   whether it runs.
2. `notify`: write one outbox row per selected channel with the machine-readable
   parameters of the ticket, the rule and the stage; the outbox worker delivers
   them with its retry and its fallback chain.
3. `webhook`: write one delivery row per selected endpoint with the event type
   `ticket.escalated`; the delivery carries the rule and the stage of the
   escalation. The webhook worker sends it with the HMAC signature and the
   backoff.
4. `history`: write one append-only `escalation_note` event with the configured
   text.
5. Call the dispatcher from the scan, after the `escalated` event, and add the
   integration test of the three action types and of a condition that skips an
   action.

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

- Files changed: the dispatcher, the scan, the delivery, the test
- Interfaces added: the dispatcher and the event `escalation_note`
- Verified: typecheck, the integration test (the three action types, the condition that skips an action)
- Follow-up WP: WP-M13-08 — the reachable stages of a ticket
- Open question: none
