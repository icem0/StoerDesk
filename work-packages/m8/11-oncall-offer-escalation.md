# WP-M8-11: on-call offer timeout to the group

format: small-model
status: done
depends-on: WP-M8-10
phase: 8
milestone: m8
context-budget: 18k tokens
spec: specs/04-oncall.md §4a.6; specs/07-escalation.md §7.1–§7.3
spec-lines: 60

files-read:

- specs/04-oncall.md (§4a.6 offer escalation after the timeout)
- apps/api/src/tickets/escalation.ts (minute scan and event idempotency)
- apps/api/src/jobs/escalation.ts (job wiring)
- apps/api/src/oncall/coupling.ts (`offerTicket`, `offer_escalated_at`)
- apps/api/src/db/schema.ts (`tickets`, `ticketEvents`)

files-write:

- apps/api/src/oncall/coupling.ts
- apps/api/src/tickets/escalation.ts
- apps/api/src/jobs/escalation.ts
- apps/api/src/oncall/__tests__/offer-timeout.integration.spec.ts (tests excluded from the limit)

interfaces:

- `escalateOnCallOffers(database, now): Promise<{ scanned: number; escalated: number }>`
- wired into `evaluateEscalations` and therefore the existing `ticket-escalation` job

## Task

1. Add `escalateOnCallOffers`: select `OFFERED` tickets with a non-null
   `offered_to_user_id` and `offer_escalated_at <= now`; in one transaction per
   ticket clear `offered_to_user_id`, set `offer_escalated_at = NULL` and append
   one `offer_escalated` event with `{ reason: 'oncall_timeout' }`.
2. An already cleared ticket or a ticket that left `OFFERED` is skipped, so a
   second scan is a no-op. A decline already returns the ticket to
   `WORK_ORDER_CREATED`; no extra path is needed.
3. Call the function from `evaluateEscalations` and include its counts in the
   return value; the existing pg-boss job then runs it every minute without a
   second queue.
4. Integration tests: escalation exactly at the threshold, no escalation before
   it, a second scan as a no-op, and a ticket that left `OFFERED`.

## Non-goals

- No notification channel or outbox write.
- No change to the offer timeout default; it stays `oncall.escalate_to_group_after_min`.
- No UI.
- No new pg-boss queue.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; tests use a real database or skip with a named reason.

## Handoff

- Files changed: the coupling service (`escalateOnCallOffers`), the escalation
  scan (runs it before the rule scan and returns the offer counters), the job
  wiring (logs `offerScanned`/`offerEscalated`), plus tests
- Interfaces added: `escalateOnCallOffers(database, now)` and the
  `offerScanned`/`offerEscalated` counters of `EscalationScanResult`
- Verified: typecheck, lint, test:run (five integration tests against a real
  database: exactly at the threshold, before it, second scan no-op, ticket that
  left `OFFERED`, and the wiring inside `evaluateEscalations`)
- Follow-up WP: WP-M8-12 (iCal feed)
- Open question: none
