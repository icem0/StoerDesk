# WP-M14-29: The allocation and a swap request enqueue their rows

format: small-model
status: planned
depends-on: WP-M14-28
phase: 14
milestone: m14
context-budget: 18k tokens
spec: specs/04-oncall.md §4a.4 (ADR-0021), specs/10-notifications.md §11.4, §11.7
spec-lines: 40

files-read:

- apps/api/src/oncall/service.ts (`createShift`, the assign branch of the shift patch)
- apps/api/src/oncall/swaps.ts (`requestSwap`)
- apps/api/src/notifications/outbox.ts (`enqueueOncallOutbox` of WP-M14-28)
- apps/api/src/oncall/routes.ts (how the services run inside the transaction)
- apps/api/src/oncall/__tests__/self-service.integration.spec.ts (the route test pattern)

files-write:

- apps/api/src/oncall/service.ts
- apps/api/src/oncall/swaps.ts
- apps/api/src/oncall/__tests__/allocation-notifications.integration.spec.ts

interfaces:

- `createShift` and the assign branch of the shift patch call
  `enqueueOncallOutbox(database, { shift, eventType: 'oncall.assigned', userId }, env)`
- `requestSwap` calls `enqueueOncallOutbox` with `eventType: 'oncall.swap_requested'` for the
  requesting technician and, when a target colleague is named, for that colleague

## Task

1. In `apps/api/src/oncall/service.ts`: when a shift is created or patched with a technician,
   enqueue `oncall.assigned` for that technician in the same transaction node the write already
   uses. A shift without a technician (`UNFILLED`) enqueues nothing, and a shift that already
   has a `PENDING` or `SENT` `oncall.assigned` row for the same technician enqueues nothing
   again.
2. In `apps/api/src/oncall/swaps.ts`: `requestSwap` enqueues `oncall.swap_requested` for the
   requesting technician and for the named target colleague; a request to the whole pool
   notifies only the requester.
3. `allocation-notifications.integration.spec.ts` on a throwaway database drives the real
   routes (`POST /api/v1/oncall/shifts` with a `userId`, the assign patch, the swap request
   route) and asserts the rows in `outbox` with `shift_id` and `event_type`, the channel of a
   technician that selected one channel and the instance chain for a technician without a
   selection.

## Non-goals

- No change of the message content or the drain — WP-M14-28 owns that.
- No confirm change — the `DRAFT` acceptance is WP-M14-30.
- No reminder row — the scan is WP-M14-31.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run -- apps/api/src/oncall/__tests__/allocation-notifications.integration.spec.ts
npm run wp:check
```

Expected: all green; the new spec fails before the change and passes after it.

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: WP-M14-30 (`30-draft-readiness-is-confirmable.md`)
- Open question: none
