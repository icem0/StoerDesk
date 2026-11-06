# WP-M8-05: on-call settings and shift planning service

format: small-model
status: planned
depends-on: WP-M8-02, WP-M8-03
phase: 8
milestone: m8
context-budget: 20k tokens
spec: specs/04-oncall.md §4a.1, §4a.3
spec-lines: 130

files-read:

- specs/04-oncall.md (§4a.1 settings, §4a.3 shifts and states, §4a.3.1)
- packages/shared/src/oncall.ts (`generateOncallSlots`, `resolveOncallSettings`)
- apps/api/src/db/schema.ts (on-call tables, `settings`, `users`)
- apps/api/src/settings/branding.ts (settings read/upsert pattern)
- apps/api/src/tickets/workflow.ts (transaction and event-write pattern)
- apps/api/src/tickets/pauses.ts (event append helper style)

files-write:

- apps/api/src/oncall/settings.ts
- apps/api/src/oncall/service.ts
- apps/api/src/oncall/events.ts
- apps/api/src/oncall/__tests__/service.integration.spec.ts (tests excluded from the limit)

interfaces:

- `readOncallSettings(database): Promise<OncallSettings>`
- `writeOncallSettings(database, patch): Promise<OncallSettings>`
- `appendOncallEvent(tx, { shiftId, type, actorUserId, payload, clientUuid? })`
- `createShift(database, input)`, `generateShifts(database, input)`
- `updateShift(database, shiftId, patch, actorUserId)` — assign, publish, reassign
- `deleteShift(database, shiftId, actorUserId)`

## Task

1. `settings.ts` reads the `oncall.*` rows once and merges them over
   `ONCALL_SETTINGS_DEFAULTS`; `writeOncallSettings` upserts only validated
   keys, and `oncall.default_pool_id` must reference an active pool.
2. `events.ts` appends one `oncall_events` row inside the caller's transaction;
   the optional `clientUuid` makes a replay a no-op by catching the unique
   violation and returning the existing event.
3. `service.ts` implements the transitions of §4a.3 for admin actions: create
   (no technician → `UNFILLED`, with technician → `DRAFT`, with `publish` →
   `PLANNED`), assign/reassign (sets the state and clears `declined_at`),
   publish, and delete only while not `CONFIRMED`/`SWAP_REQUESTED` and not
   started (`409 oncall_shift_locked`).
4. `generateShifts` calls `generateOncallSlots` and inserts with
   `ON CONFLICT (pool_id, starts_at) DO NOTHING`; it returns `created` and
   `skipped` counts and never updates an existing slot.
5. Integration tests: the three create shapes, publish, reassign, locked delete,
   idempotent generation and the event trail.

## Non-goals

- No routes (WP-M8-06) and no UI (WP-M8-13).
- No confirm/decline (WP-M8-07) or swaps (WP-M8-08).
- No ticket coupling (WP-M8-10).

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

- Files changed: settings reader/writer, event helper, planning service, tests
- Interfaces added: the four service entry points above
- Verified: typecheck, lint, test:run
- Follow-up WP: WP-M8-06 (shift routes)
- Open question: none
