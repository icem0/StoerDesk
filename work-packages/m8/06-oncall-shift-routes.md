# WP-M8-06: on-call shift and settings routes

format: small-model
status: planned
depends-on: WP-M8-04, WP-M8-05
phase: 8
milestone: m8
context-budget: 18k tokens
spec: specs/04-oncall.md §4a.1, §4a.3, §4a.8
spec-lines: 90

files-read:

- specs/04-oncall.md (§4a.1 settings, §4a.3 transitions, §4a.8 API summary)
- apps/api/src/oncall/service.ts (planning service from WP-M8-05)
- apps/api/src/oncall/pools.ts (route plugin and guard pattern)
- packages/shared/src/schemas/oncall.ts (existing schemas)
- apps/api/src/index.ts (plugin registration)

files-write:

- apps/api/src/oncall/routes.ts
- packages/shared/src/schemas/oncall.ts
- packages/shared/src/schemas/index.ts
- apps/api/src/index.ts

interfaces:

- `GET /api/v1/oncall/shifts?from=&to=&poolId=` (`oncall.read`) — range rows
- `POST /api/v1/oncall/shifts` and `/shifts/generate` (`oncall.plan`)
- `PATCH/DELETE /api/v1/oncall/shifts/:id` (`oncall.admin`)
- `GET/PUT /api/v1/settings/oncall` (`settings.read` / `settings.write`)
- `oncallShiftSchema`, `createShiftRequestSchema`, `generateShiftsRequestSchema`

## Task

1. Extend the shared on-call schemas with the shift, create, generate, update
   and settings bodies of §4a.1/§4a.3.
2. Implement `oncallRoutes` with the six route groups; a range is mandatory and
   capped at 366 days (`422 oncall_range_too_large`), ids are UUIDs
   (`404 oncall_shift_not_found`).
3. The settings routes read and write through `readOncallSettings` /
   `writeOncallSettings`; a malformed patch answers `400 invalid_request`.
4. Register `oncallRoutes` in `apps/api/src/index.ts` next to the pool plugin,
   so confirm/decline and swaps can extend the same file later.
5. Integration tests for the range cap, the permission split and the settings
   round-trip.

## Non-goals

- No confirm/decline, swap or coupling routes (WP-M8-07/09/10).
- No UI (WP-M8-13).
- No iCal feed (WP-M8-12).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; tests use a real database or skip with a named reason.

## Handoff

- Files changed: the shift/settings route plugin, the shared schemas and their
  export, the API registration, plus tests
- Interfaces added: the routes and schemas above
- Verified: typecheck, lint, test:run
- Follow-up WP: WP-M8-07 (confirm/decline) and WP-M8-09 (swap routes)
- Open question: none
