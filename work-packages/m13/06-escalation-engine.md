# WP-M13-06: The engine on the database rules

format: small-model
status: done
depends-on: WP-M13-03, WP-M13-04
phase: 13
milestone: m13
context-budget: 24k tokens
spec: specs/07-escalation.md §7.2, §7.3, §7.7, §7.8
spec-lines: 100

files-read:

- specs/07-escalation.md §7.2, §7.3, §7.7, §7.8
- apps/api/src/tickets/escalation.ts (the scan it replaces)
- packages/shared/src/escalation.ts (the hard-coded rules it replaces)
- apps/api/src/tickets/pauses.ts (the pause clock)
- apps/api/src/tickets/workflow.ts (the transition events)

files-write:

- apps/api/src/tickets/escalation.ts
- apps/api/src/tickets/__tests__/escalation.integration.spec.ts
- apps/api/src/tickets/__tests__/escalation-exit.integration.spec.ts

interfaces:

- `evaluateEscalations(database, now?)` — reads the rules from the database
- `evaluateTicketEscalations(database, ticketId, now?)`
- the event `escalated` with the payload `{ rule, stage, thresholdAt, deadlineAt }`
- the firing row in `escalation_firings` (unique per ticket, rule and threshold)

## Task

1. Replace the hard-coded rules: the scan reads the active rules of the
   database, computes the threshold of every rule from its reference event and
   its minutes per priority (the deadline rules from the percentage of the
   timeline) and subtracts the overlapping pauses.
2. Evaluate the condition of the rule; a rule whose condition does not match
   never fires.
3. Fire the rule: insert the firing row (the unique key makes a second scan a
   no-op), write the `escalated` event with the rule, the stage, the threshold
   and the deadline, and hand the firing to the action dispatcher.
4. Keep the candidate selection (not acknowledged, not closed, not cancelled,
   not suspected spam), the on-call offer timeout of the scan and the pause
   behaviour. The hard-coded rule list of the shared module stays until
   WP-M13-13, where the deadline route stops reading the former settings rows.

## Non-goals

- No actions yet (WP-M13-07).
- No change to the job, the queue name or the schedule.
- No change to the ticket state machine.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run test:run -- apps/api/src/tickets/__tests__/escalation.integration.spec.ts
npm run wp:check
```

Expected: all green; the test proves the firing, the idempotency, the pause, the
condition and the deadline rule.

## Handoff

- Files changed: the scan, the shared module, the two tests
- Interfaces added: the two scan functions and the firing row
- Verified: typecheck, the integration tests (the firing, the idempotency, the pause, the condition, the deadline rules)
- Follow-up WP: WP-M13-07 — the actions
- Open question: none
