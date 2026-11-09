# WP-M9-12: statistics JSON routes

format: small-model
status: planned
depends-on: WP-M9-10, WP-M9-11
phase: 9
milestone: m9
context-budget: 16k tokens
spec: specs/12-stats.md §12.8; PLAN.md §5
spec-lines: 40

files-read:

- specs/12-stats.md (§12.8 API)
- apps/api/src/stats/reaction-times.ts, frequency.ts, objects.ts, compliance.ts (service signatures)
- packages/shared/src/schemas/stats.ts (filter schema)
- apps/api/src/oncall/pools.ts (plugin and permission style)
- apps/api/src/index.ts (route registration)
- apps/api/src/tickets/__tests__/list.routes.integration.spec.ts (route test setup)

files-write:

- apps/api/src/stats/routes.ts
- apps/api/src/index.ts
- apps/api/src/stats/__tests__/stats.routes.integration.spec.ts

interfaces:

- `statsRoutes` Fastify plugin guarded by `stats.read`
- `GET /api/v1/stats/reaction-times`
- `GET /api/v1/stats/frequency?bucket=day|week|month`
- `GET /api/v1/stats/objects`
- `GET /api/v1/stats/compliance`

## Task

1. Add `apps/api/src/stats/routes.ts` with the four read routes of §12.8,
   each guarded by `stats.read` and each validating the shared filter schema.
2. Parse the query once: reject a malformed filter with `422 invalid_request`
   and field errors, an impossible range with `422 stats_range_invalid`, and a
   missing/invalid `bucket` for the frequency route.
3. Load the conspicuous threshold through `readDashboardSettings` for the
   objects route and pass the request time to the compliance route.
4. Register `statsRoutes` in `apps/api/src/index.ts`.
5. Add a route test: each route answers its section for a `manager`, a user
   without `stats.read` is rejected, and the two invalid-range cases answer the
   documented codes.

## Non-goals

- No CSV route (WP-M9-13).
- No dashboard route; the dashboard has its own snapshot (WP-M9-06).
- No caching layer and no background refresh.
- No UI.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the route test runs against a throwaway database and skips
with a named reason otherwise.

## Handoff

- Files changed: the statistics route plugin, the server registration, the route test
- Interfaces added: the four statistics JSON routes
- Verified: typecheck, lint, test:run, wp:check
- Follow-up WP: WP-M9-13 (CSV export), WP-M9-15 (web statistics page)
- Open question: none
