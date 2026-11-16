# WP-M14-82b: the offer names the responsible person and the distribution notifies the technicians

format: small-model
status: planned
depends-on: WP-M14-82
phase: 14
milestone: m14
context-budget: 18k tokens
spec: specs/07-escalation.md §7.14
spec-lines: 55

files-read:

- apps/api/src/escalation/distribution.ts (the distribution of WP-M14-82)
- apps/api/src/oncall/coupling.ts (`resolveOnCallPerson`, `OfferTicketInput`, the offer timeout)
- apps/api/src/oncall/settings.ts (`readOncallSettings` — `escalateToGroupAfterMin`)
- apps/api/src/notifications/receivers.ts (`ntfyRecipients`, `notificationAccounts`)
- apps/api/src/notifications/outbox.ts (the ntfy topic of an outbox row)

files-write:

- apps/api/src/escalation/distribution.ts
- apps/api/src/tickets/workflow.ts
- apps/api/src/notifications/receivers.ts

interfaces:

- `ntfyTopicsOfUsers(database, eventType, userIds): Promise<string[]>`
- `transitionTicket()` writes `offered_to_user_id` and `offer_escalated_at` from
  the payload of an `offered` step
- `distributeTicket` resolves the on-call person of a pool target, sets the offer
  timeout and queues one ntfy row per technician on their own topic

## Task

1. `apps/api/src/tickets/workflow.ts`: the workflow columns of the `offered`
   step — `offered_to_user_id` and `offer_escalated_at` are taken from the
   payload beside the status, so the distribution stays in the transaction of
   the transition (`PLAN.md` §7: the offer belongs to one statement).
2. `apps/api/src/notifications/receivers.ts`: `ntfyTopicsOfUsers(database,
   eventType, userIds)` returns the stored topic (`external_id`) of every user
   of the list who selected the ntfy channel for that event type (§11.3, §11.4)
   — the broadcast reaches the technicians of the target, not the instance.
3. `apps/api/src/escalation/distribution.ts`: an offer to a pool target first
   resolves the on-call person (`resolveOnCallPerson` of §4a.6) — its user
   leaves in the payload to the transition — and sets the offer timeout
   (`oncall.escalate_to_group_after_min` of `readOncallSettings`); a pool
   without a covering shift offers to the whole group without a timeout, a
   group target the same. After the distribution every technician of the target
   receives one outbox row on the ntfy channel with their own topic
   (`ticket.escalated` for an offer, `ticket.assigned` for an assignment) and
   the distribution result counts the notified technicians.
4. The integration spec of WP-M14-82 gains the assertions: a staffed pool offer
   writes `offered_to_user_id` and the offer timeout, an unstaffed offer
   changes neither, and a technician with an ntfy account and a selection
   receives one row.

## Non-goals

- No configuration service, no UI (WP-M14-83 … WP-M14-85).
- No per-user routing for the channels other than ntfy (named limitation of
  ADR-0026).
- No change of the manual offer route of the office and its warnings.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the extended integration spec proves the offer columns and
the broadcast rows.

## Handoff

- Files changed: `apps/api/src/tickets/workflow.ts`, `apps/api/src/notifications/receivers.ts`,
  `apps/api/src/escalation/distribution.ts`, the integration spec and the
  repository bookkeeping
- Interfaces added: `ntfyTopicsOfUsers`, the offer columns of the `offered` step,
  the broadcast rows of `distributeTicket`
- Verified:
- Follow-up WP: WP-M14-83 (the configuration service validates the target)
- Open question: none
