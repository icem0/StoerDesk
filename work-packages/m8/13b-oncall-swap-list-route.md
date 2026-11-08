# WP-M8-13b: pending swap list route

format: small-model
status: done
depends-on: WP-M8-09
phase: 8
milestone: m8
context-budget: 18k tokens
spec: specs/04-oncall.md §4a.5, §4a.8
spec-lines: 60

files-read:

- specs/04-oncall.md (§4a.5 swap requests, §4a.8 API summary)
- apps/api/src/oncall/swap-routes.ts (existing swap routes)
- apps/api/src/db/schema.ts (oncall_swap_requests, oncall_shifts, oncall_pools)
- packages/shared/src/schemas/oncall.ts (swap schemas)
- apps/api/src/oncall/__tests__/swap-routes.integration.spec.ts (test fixture)

files-write:

- apps/api/src/oncall/swap-routes.ts
- packages/shared/src/schemas/oncall.ts
- apps/api/src/oncall/__tests__/swap-routes.integration.spec.ts

interfaces:

- `GET /api/v1/oncall/swaps?status=PENDING|ACCEPTED` (`oncall.admin`)
- `oncallSwapListResponseSchema`, `OncallSwapListResponse`

## Task

1. Add `oncallSwapListResponseSchema`: an `oncallSwapSchema` plus a `shift`
   object (`id`, `poolId`, `poolName`, `startsAt`, `endsAt`).
2. Add the `GET /api/v1/oncall/swaps` route to `swapRoutes`, guarded by
   `oncall.admin`. The optional `status` query accepts `PENDING` or `ACCEPTED`;
   without it both are returned. Join `oncall_shifts` and `oncall_pools`, order
   by `starts_at` and answer `{ swaps: [...] }`.
3. Invalid query → `400 invalid_request` with `params.fields`.
4. Integration test: an admin sees a pending and an accepted request with the
   shift and pool data; an on-call technician gets `403`; a bad status gets
   `400`.

## Non-goals

- No change to the accept/approve/reject/cancel behaviour.
- No UI (WP-M8-13 reads this route).
- No pagination: the pending list is bounded by the shift window.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the integration test skips with a named reason without
PostgreSQL (reported as unverified).

## Handoff

- Files changed: the swap route file, the shared swap schema, the swap route test
- Interfaces added: `GET /api/v1/oncall/swaps`, `oncallSwapListResponseSchema`
- Verified: typecheck, lint, focused `vitest run` (integration against
  PostgreSQL) and `wp:check`; the full `npm run check` hit the pre-existing
  `permission denied to terminate process` in unrelated integration suites of
  this container and is reported as unverified, not green
- Follow-up WP: WP-M8-13 (admin page)
- Open question: none
