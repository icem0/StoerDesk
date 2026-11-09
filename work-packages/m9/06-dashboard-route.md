# WP-M9-06: dashboard snapshot route

format: small-model
status: planned
depends-on: WP-M9-05
phase: 9
milestone: m9
context-budget: 14k tokens
spec: specs/11-dashboard.md §11.1, §11.2; PLAN.md §5
spec-lines: 50

files-read:

- specs/11-dashboard.md (§11.1 permissions, §11.2 snapshot)
- apps/api/src/dashboard/service.ts (snapshot builder)
- apps/api/src/oncall/pools.ts (permission guard and plugin style)
- apps/api/src/auth/requirePermission.ts (`requirePermission`)
- apps/api/src/index.ts (route registration)
- apps/api/src/tickets/__tests__/list.routes.integration.spec.ts (route test setup)

files-write:

- apps/api/src/dashboard/routes.ts
- apps/api/src/index.ts
- apps/api/src/dashboard/__tests__/dashboard.routes.integration.spec.ts

interfaces:

- `dashboardRoutes` Fastify plugin
- `GET /api/v1/dashboard` guarded by `ticket.read`
- optional `onCall` section only with `oncall.read`, optional `channels` only with `notification.read`

## Task

1. Add `apps/api/src/dashboard/routes.ts` as a Fastify plugin: `GET
   /api/v1/dashboard` requires `ticket.read` and answers the snapshot of
   `buildDashboardSnapshot`.
2. Resolve the optional sections per request: pass `includeOnCall` only when the
   actor holds `oncall.read` and `includeChannels` only with `notification.read`,
   so a denied section is `null` rather than a `403`.
3. Validate the answer with the shared `dashboardSnapshotSchema` before sending.
4. Register `dashboardRoutes` in `apps/api/src/index.ts` next to the ticket
   routes.
5. Add a route test: `ticket.read` sees the ticket tiles, a user without
   `oncall.read` gets `onCall: null`, a user with it sees the resolved shift, and
   an unauthenticated request is rejected by the session guard.

## Non-goals

- No SSE stream (WP-M9-07).
- No TV token route (WP-M9-09).
- No dashboard settings (WP-M9-08).
- No statistics route.

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

- Files changed: the dashboard route plugin, the server registration, the route test
- Interfaces added: `GET /api/v1/dashboard`
- Verified: typecheck, lint, test:run, wp:check
- Follow-up WP: WP-M9-07 (stream), WP-M9-14 (web consumer)
- Open question: none
