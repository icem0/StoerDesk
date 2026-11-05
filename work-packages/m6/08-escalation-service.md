# WP-M6-08: escalation scan and event writer

format: small-model
status: planned
depends-on: WP-M6-05, WP-M6-07
phase: 6
milestone: m6
context-budget: 20k tokens
spec: specs/07-escalation.md §7.1–§7.2; specs/05-timeline.md §5.3
spec-lines: 80

files-read:

- specs/07-escalation.md §7.1–§7.2
- packages/shared/src/escalation.ts
- packages/shared/src/timeline.ts
- apps/api/src/db/schema.ts (tickets, ticketEvents, ticketPauses)
- apps/api/src/tickets/pauses.ts

files-write:

- apps/api/src/tickets/escalation.ts
- apps/api/src/tickets/__tests__/escalation.integration.spec.ts

interfaces:

- `evaluateEscalations(database, now?): Promise<{ scanned, fired, skipped }>`
- `evaluateTicketEscalations(database, ticketId, now?): Promise<EscalationFired[]>`
- event `escalated` with `payload { rule, level, thresholdAt, deadlineAt }`,
  `actor_kind = 'system'`
- `EscalationError` only for a missing ticket

## Task

1. Select candidate tickets: status not `CLOSED`/`CANCELLED`, not
   `ACKNOWLEDGED`, not `suspected_spam`; include the last events of the
   reference types and the pauses.
2. For each rule of `escalationRulesFor(priority)` compute the reference time
   (received_at or the last reference event), subtract overlapping pauses and
   compare with the threshold; the deadline rules use the shared timeline of
   `specs/05-timeline.md`.
3. Insert `escalated` only when no event with the same `rule` and
   `thresholdAt` exists (the idempotency of §7.2); one transaction per ticket.
4. Integration test: a `NEW` critical ticket fires `new_without_review` after
   5 min, a paused ticket does not, a second run fires nothing, an overdue
   ticket fires `deadline_exceeded` and `deadline_80_percent` at the right
   points.

## Non-goals

- No pg-boss job (WP-M6-09).
- No notification, no state change, no user lookup.
- No rule for reopened tickets.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the integration test proves idempotency and pauses.

## Handoff

- Files changed: escalation service and its integration test
- Interfaces added: the two functions and the event contract
- Verified: typecheck, lint, test:run
- Follow-up WP: WP-M6-09 (pg-boss job)
- Open question: none
