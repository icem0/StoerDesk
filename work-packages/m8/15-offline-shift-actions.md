# WP-M8-15: offline shift confirm and decline

format: small-model
status: done
depends-on: WP-M8-07, WP-M8-14
phase: 8
milestone: m8
context-budget: 20k tokens
spec: specs/04-oncall.md §4a.4, §4a.9; specs/09-offline.md §9.6
spec-lines: 60

files-read:

- specs/04-oncall.md (§4a.4 confirm/decline, §4a.9 boundaries)
- specs/09-offline.md (§9.6 offline internal writes)
- apps/web/src/lib/outbox.ts (Dexie tables, delivery and replay)
- apps/web/src/features/tickets/use-internal-actions.ts (queue pattern)
- apps/web/src/features/oncall/my-shifts-page.tsx (page from WP-M8-14)
- apps/web/src/main.tsx (replay on start and `online`)

files-write:

- apps/web/src/lib/outbox.ts
- apps/web/src/features/oncall/use-shift-actions.ts
- apps/web/src/features/oncall/my-shifts-page.tsx
- apps/web/src/main.tsx

interfaces:

- Dexie `StörDeskOutbox` version 3 table `shift_actions` keyed by `client_uuid`
- `enqueueShiftAction(input)`, `queuedShiftActions()`, `replayShiftActions()`
- `useShiftActions(shiftId)` — online call or offline queue with a banner
- `POST /v1/oncall/shifts/:id/confirm|decline` with `clientUuid`

## Task

1. Add Dexie version 3 with a `shift_actions` table (`client_uuid`, `shift_id`,
   `action`, `payload`, `status`, `error_code`, `retries`, `created_at`) next to
   the existing `outbox` and `internal_actions` tables; keep the old schema
   versions untouched.
2. `enqueueShiftAction` stores a confirm or decline with a new `client_uuid`;
   `replayShiftActions` delivers oldest first through the existing API routes
   and removes a delivered row. A rejected row keeps the API code (for example
   `oncall_shift_started`) and is not retried, like the conflict rows of
   WP-M5-06.
3. `useShiftActions` tries the online call first; when the browser is offline it
   queues the action and shows the existing offline banner pattern. The decline
   reason is validated before queueing.
4. `my-shifts-page.tsx` uses the hook for confirm and decline; the queued state
   is visible on the shift card.
5. `main.tsx` calls `replayShiftActions()` on start and on `online`, beside
   `replayOutbox` and `replayInternalActions`. Unit tests cover the queue,
   replay, rejection and the offline fallback.

## Non-goals

- No offline swap request or swap acceptance (online-only).
- No offline shift creation or planning.
- No API change beyond the already shipped `clientUuid` handling.
- No service-worker background-sync route for shift actions; the existing
  start/online triggers suffice (iOS rule of `specs/09-offline.md` §9.6).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the unit tests use `fake-indexeddb` and need no server.

## Handoff

- Files changed: the outbox (Dexie v3 `shift_actions` plus
  `enqueueShiftAction`/`queuedShiftActions`/`updateShiftAction`/
  `removeShiftAction`/`deliverShiftAction`/`replayShiftActions`), the new
  `use-shift-actions` hook, the my-shifts page (online-first actions with an
  inline queued/rejected banner on the shift card) and the app start/online
  replay chain, plus tests
- Interfaces added: `ShiftActionKind`, `QueuedShiftAction`, the Dexie v3 table
  keyed by `client_uuid`, the queue/replay helpers and `useShiftActions(shiftId)`
- Verified: typecheck (all workspaces), lint, test:run, i18n:check, wp:check,
  build (web)
- Follow-up WP: WP-M8-16 (exit criterion)
- Open question: none
