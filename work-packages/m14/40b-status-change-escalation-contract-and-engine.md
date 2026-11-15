# WP-M14-40b: the shared contract of `status_change` and the engine that performs it

format: small-model
status: planned
depends-on: WP-M14-40
phase: 14
context-budget: 18k tokens
spec: specs/07-escalation.md §7.5, §7.12, §7.13
spec-lines: 60

files-read:

- packages/shared/src/schemas/escalation-config.ts (`ESCALATION_ACTION_TYPES`, `escalationActionConfigSchema`)
- apps/api/src/escalation/config.ts (`actionConfig`, `writeEscalationConfig`)
- apps/api/src/escalation/actions.ts (`dispatchEscalationActions`)
- apps/api/src/tickets/workflow.ts (`transitionTicket`)
- apps/api/src/tickets/transition-service.ts (`readTicketTransitions`, `resolveTransition`)

files-write:

- packages/shared/src/schemas/escalation-config.ts
- apps/api/src/escalation/config.ts
- apps/api/src/escalation/actions.ts

interfaces:

- `status_change` as an `EscalationActionConfig` variant with `toStatus` bound to
  the key format of `ticketStatusKeySchema`
- `writeEscalationConfig` answers `400 invalid_status_key` for a target status that
  names no row of `ticket_statuses`
- `dispatchEscalationActions` performs a `status_change` action with the step of the
  `ticket_transitions` table that leads from the current status to the target

## Task

1. `packages/shared/src/schemas/escalation-config.ts`: `ESCALATION_ACTION_TYPES`
   gains `status_change`; the discriminated union gains the variant
   `{ key, type: 'status_change', toStatus, condition }` with `toStatus` bound to
   `ticketStatusKeySchema` (imported from `./ticket.js`).
2. `apps/api/src/escalation/config.ts`: `actionConfig` maps the new type onto the
   `config` jsonb (`{ toStatus }`); `writeEscalationConfig` rejects a `status_change`
   whose `toStatus` names no row of `ticket_statuses` with the existing
   `400 invalid_status_key` and the field path
   `rules.<i>.actions.<j>.toStatus` (the service rule of WP-M14-39, now on the
   escalation side).
3. `apps/api/src/escalation/actions.ts`: a `status_change` action whose condition
   matches reads the current status of the ticket, finds the **active** row of
   `ticket_transitions` that goes to `toStatus` (`readTicketTransitions`) and runs
   it through `transitionTicket()` (`actorKind: 'system'`, the payload carries the
   rule and the stage, never a contact); the dispatcher appends one
   `escalation_note` event with `{ rule, stage, from, to }` documenting the change
   in the same transaction as the other actions. Without such a step the action
   changes nothing. `EscalationActionResult` gains the `statusChanged` counter.
4. Tests: the shared unit test of the new variant; the integration spec of a fired
   rule with a `status_change` action on a throwaway database (status changed, the
   step event and the note written, a second scan a no-op, an unknown target
   rejected `400`).

## Non-goals

- No UI (WP-M14-40c), no route change (`PUT /api/v1/escalation/config` already
  carries the action), no time-based conditions (WP-M14-41).
- No change of `transitionTicket()` itself (WP-M14-38c owns it); no new error code.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; on a throwaway PostgreSQL an escalation rule with a
`status_change` action moves the ticket to the configured target status once,
writes the step event and one `escalation_note`, repeats as a no-op and an
unknown target status answers `400 invalid_status_key`.

## Handoff

- Files changed: the shared contract, the config service, the dispatcher
- Interfaces added: the `status_change` variant, the `statusChanged` counter
- Verified: typecheck, ESLint, vitest (the integration spec skips without a
  database and is reported as unverified)
- Follow-up WP: WP-M14-40c (the administration offers the action)
- Open question: resolved — the status change performs a step of the transition
  table, so the workflow columns stay keyed by the `event_key` of that step
