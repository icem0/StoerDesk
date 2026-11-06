# WP-M8-07: shift confirm and decline

format: small-model
status: planned
depends-on: WP-M8-02, WP-M8-05, WP-M8-06
phase: 8
milestone: m8
context-budget: 18k tokens
spec: specs/04-oncall.md §4a.4, §4a.8
spec-lines: 70

files-read:

- specs/04-oncall.md (§4a.4 confirmation and decline)
- apps/api/src/oncall/service.ts (state checks and event helper)
- apps/api/src/oncall/routes.ts (route plugin from WP-M8-06)
- apps/api/src/tickets/workflow-routes.ts (`clientUuid` and replay pattern)
- packages/shared/src/schemas/oncall.ts (shift schemas)
- apps/api/src/db/schema.ts (`oncallEvents.clientUuid`)

files-write:

- apps/api/src/oncall/confirm.ts
- apps/api/src/oncall/routes.ts
- packages/shared/src/schemas/oncall.ts
- apps/api/src/oncall/__tests__/confirm.integration.spec.ts (tests excluded from the limit)

interfaces:

- `confirmShift({ database, shiftId, actorUserId, clientUuid? })`
- `declineShift({ database, shiftId, actorUserId, reason, clientUuid? })`
- `POST /api/v1/oncall/shifts/:id/confirm` and `/decline` (`oncall.confirm`)
- `confirmShiftRequestSchema`, `declineShiftRequestSchema`

## Task

1. `confirm.ts` loads the shift with its technician; only the assigned user or
   an admin may act (`403 forbidden`), only `PLANNED` may be confirmed and only
   `PLANNED`/`CONFIRMED` may be declined before `starts_at`
   (`409 oncall_shift_started`, `409 oncall_invalid_shift_state`).
2. Confirm sets `state = CONFIRMED` and `confirmed_at`; decline requires a
   5–500 character reason (`422 oncall_decline_reason_required`), sets
   `state = DECLINED` and `declined_at`.
3. Both write one `oncall_events` row (`confirmed`/`declined`) with the actor
   and payload in the same transaction. A repeated `clientUuid` answers `200`
   with the current shift and writes no second event.
4. Add the two routes to `oncallRoutes` with the request schemas.
5. Integration tests: foreign actor, wrong state, start-time guard, missing
   reason, successful confirm/decline, and a replayed `clientUuid`.

## Non-goals

- No swap request (WP-M8-08).
- No offline client queue (WP-M8-15).
- No notification on confirm/decline.
- No admin override beyond the existing admin permission.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the integration test runs against PostgreSQL or skips with
a named reason.

## Handoff

- Files changed: the confirm/decline service, the route plugin, the shared
  schemas, plus tests
- Interfaces added: `confirmShift`, `declineShift` and the two routes
- Verified: typecheck, lint, test:run
- Follow-up WP: WP-M8-14 (my-shifts page) and WP-M8-15 (offline queue)
- Open question: none
