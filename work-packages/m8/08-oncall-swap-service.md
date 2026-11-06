# WP-M8-08: swap request and atomic acceptance service

format: small-model
status: planned
depends-on: WP-M8-02, WP-M8-05, WP-M8-07
phase: 8
milestone: m8
context-budget: 20k tokens
spec: specs/04-oncall.md §4a.5; ADR-0011 decision 2
spec-lines: 110

files-read:

- specs/04-oncall.md (§4a.5 swap requests)
- docs/DECISIONS/0011-oncall-slot-model-and-swap-approval.md (approval default)
- apps/api/src/oncall/service.ts (shift transitions and event helper)
- apps/api/src/db/schema.ts (oncall_swap_requests, oncall_pools.group_id, user_groups)
- apps/api/src/oncall/settings.ts (`swapRequiresAdminApproval`)
- apps/api/src/tickets/workflow.ts (transaction style)

files-write:

- apps/api/src/oncall/swaps.ts
- apps/api/src/oncall/__tests__/swaps.integration.spec.ts (tests excluded from the limit)

interfaces:

- `requestSwap({ database, shiftId, actorUserId, targetUserId? })`
- `acceptSwap({ database, swapId, actorUserId })` — atomic first acceptance
- `approveSwap({ database, swapId, actorUserId })`, `rejectSwap({ database, swapId, actorUserId })`
- `cancelSwap({ database, swapId, actorUserId })`

## Task

1. `requestSwap` accepts only a `CONFIRMED` shift before `starts_at` by its
   assigned technician; `targetUserId` must be an active member of the pool
   (group members or `oncall`-role users) and not the requester. The shift moves
   to `SWAP_REQUESTED`; one `PENDING` request per shift is enforced by the
   partial unique index (`409 swap_already_open`).
2. `acceptSwap` uses the atomic `UPDATE … WHERE status = 'PENDING' RETURNING`
   of §4a.5. The loser gets `409 swap_taken`. The candidate must be a pool
   member and not the requester. With `swap_requires_admin_approval = true` the
   request becomes `ACCEPTED` and the shift keeps its original technician; with
   `false` it becomes `APPROVED`, the shift gets the accepting user and both
   actions are effective immediately.
3. `approveSwap` (admin) moves an `ACCEPTED` request to `APPROVED`, sets the
   shift user to the candidate and returns the shift to `CONFIRMED`;
   `rejectSwap` moves `ACCEPTED`/`PENDING` to `DECLINED`; `cancelSwap` (requester
   or admin) moves `PENDING`/`ACCEPTED` to `CANCELLED`. Both return the shift to
   `CONFIRMED` with the original technician.
4. Every step writes one `oncall_events` row; a request that is closed cannot be
   accepted (`409 swap_not_pending`) and a shift that started rejects acceptance
   (`409 oncall_shift_started`).
5. Integration tests: two concurrent acceptances (exactly one wins), approval
   on/off, foreign candidate, rejection and cancellation.

## Non-goals

- No routes or shared schemas (WP-M8-09).
- No UI (WP-M8-13/14).
- No notification and no offline acceptance (online-only).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the atomic test runs against PostgreSQL or skips with a
named reason and asserts exactly one successful acceptance.

## Handoff

- Files changed: the swap service and its integration tests
- Interfaces added: the five swap service functions
- Verified: typecheck, lint, test:run
- Follow-up WP: WP-M8-09 (swap routes)
- Open question: none
