# WP-M8-10: on-call ticket coupling and warnings

format: small-model
status: done
depends-on: WP-M8-05, WP-M8-06, WP-M8-07
phase: 8
milestone: m8
context-budget: 22k tokens
spec: specs/04-oncall.md §4a.6
spec-lines: 110

files-read:

- specs/04-oncall.md (§4a.6 ticket coupling)
- apps/api/src/oncall/service.ts (shift queries and settings reader)
- apps/api/src/tickets/workflow-routes.ts (offer route and handler)
- apps/api/src/tickets/workflow.ts (OFFERED transition and event payload)
- apps/api/src/db/schema.ts (`tickets.offeredToUserId`, `offerEscalatedAt`)
- apps/api/src/oncall/routes.ts (route plugin from WP-M8-06)

files-write:

- apps/api/src/oncall/coupling.ts
- apps/api/src/tickets/workflow-routes.ts
- apps/api/src/oncall/routes.ts
- apps/api/src/oncall/__tests__/coupling.integration.spec.ts (tests excluded from the limit)

interfaces:

- `resolveOnCallPerson(database, { at, poolId? }): Promise<OnCallResolution>`
- `OnCallResolution = { kind: 'confirmed'|'planned'|'unstaffed', userId?, shiftId?, poolId, endsAt? }`
- `offerTicket({ database, ticketNo, actorUserId, poolId? })`
- `GET /api/v1/oncall/warnings` (`oncall.read`) — unstaffed and unconfirmed slots

## Task

1. `resolveOnCallPerson` resolves the default pool (`oncall.default_pool_id`,
   else the first active pool by lower-case name) and looks for a `CONFIRMED`
   shift covering `at`, then a `PLANNED` one; `SWAP_REQUESTED` counts with its
   original technician. It returns the three resolution kinds of §4a.6.
2. `offerTicket` implements the `offered` transition of `WORK_ORDER_CREATED`
   in one transaction: set `OFFERED`; on `confirmed`/`planned` set
   `offered_to_user_id` and `offer_escalated_at = now + escalate_to_group_after_min`;
   on `unstaffed` clear `offered_to_user_id`; append the `offered` event with
   `{ onCall, shiftId, poolId, warning? }`; return the ticket and the warning.
3. Replace the generic `offered` route handler with `offerTicket`, accepting an
   optional `poolId` in the body (`400 invalid_request` for a malformed id).
4. Add `GET /api/v1/oncall/warnings` to `oncallRoutes`: unstaffed shifts inside
   `unfilled_warning_days`, `PLANNED` shifts starting within
   `reminder_unconfirmed_h`, and the resolved default pool.
5. Integration tests: confirmed, planned and unstaffed offers; the event
   payload; the two warning lists.

## Non-goals

- No dashboard tile (phase 9).
- No notification delivery; the outbox and channels stay unchanged.
- No timeout/group escalation job (WP-M8-11).
- No UI (WP-M8-13).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; tests use a real database or skip with a named reason.

## Handoff

- Files changed: the coupling service, the offer route, the warnings route,
  plus tests
- Interfaces added: `resolveOnCallPerson`, `offerTicket` and the warnings route
- Verified: typecheck, lint, test:run (integration test ran against PostgreSQL)
- Follow-up WP: WP-M8-11 (offer timeout)
- Open question: none
