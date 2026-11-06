# WP-M8-09: swap routes

format: small-model
status: planned
depends-on: WP-M8-06, WP-M8-08
phase: 8
milestone: m8
context-budget: 16k tokens
spec: specs/04-oncall.md §4a.5, §4a.8
spec-lines: 60

files-read:

- specs/04-oncall.md (§4a.5 swap API, §4a.8 summary)
- apps/api/src/oncall/swaps.ts (swap service from WP-M8-08)
- apps/api/src/oncall/routes.ts (route plugin from WP-M8-06)
- packages/shared/src/schemas/oncall.ts (schema module)
- apps/api/src/auth/requirePermission.ts (guard usage)

files-write:

- apps/api/src/oncall/swap-routes.ts
- apps/api/src/oncall/routes.ts
- packages/shared/src/schemas/oncall.ts

interfaces:

- `POST /api/v1/oncall/shifts/:id/swap` (`oncall.swap`)
- `POST /api/v1/oncall/swaps/:id/accept` (`oncall.swap`)
- `POST /api/v1/oncall/swaps/:id/approve|reject` (`oncall.admin`)
- `POST /api/v1/oncall/swaps/:id/cancel` (`oncall.swap` or `oncall.admin`)
- `swapRequestSchema`, `swapIdParamSchema`

## Task

1. Add the shared request schemas: an optional `targetUserId` UUID for the swap
   request and UUID param validation for every swap id.
2. Implement `swapRoutes` as a Fastify plugin: each route validates the body,
   resolves the actor from the session, calls the matching service function of
   WP-M8-08 and maps `TicketTransitionError`-style errors to `{ code, params }`.
3. `cancel` is allowed for the requester or an admin; the service decides, the
   route only passes the actor.
4. Register `swapRoutes` from `oncallRoutes` so `apps/api/src/index.ts` keeps a
   single on-call registration.
5. Integration tests for the permission split, the loser's `409 swap_taken` and
   the approval paths.

## Non-goals

- No service logic changes beyond what the routes need.
- No UI (WP-M8-13/14).
- No notifications and no offline swap acceptance.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; tests use a real database or skip with a named reason.

## Handoff

- Files changed: the swap route plugin, its registration, the shared schemas,
  plus tests
- Interfaces added: the swap routes and schemas above
- Verified: typecheck, lint, test:run
- Follow-up WP: WP-M8-13 (admin page) and WP-M8-14 (my-shifts page)
- Open question: none
