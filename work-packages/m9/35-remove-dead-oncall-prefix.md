# WP-M9-35: remove the dead `prefix` option on the on-call pools plugin (SEC-010)

format: small-model
status: done
depends-on: WP-M9-34
phase: 9
milestone: m9
context-budget: 6k tokens
spec: PLAN.md §15 (audit — SEC-010); `fastify-plugin` skip-override rules
spec-lines: 14

files-read:

- apps/api/src/index.ts (register oncallPoolsRoutes)
- apps/api/src/oncall/pools.ts (OncallPoolsRouteOptions)

files-write:

- apps/api/src/index.ts

interfaces:

- `oncallPoolsRoutes` is registered with only `{ database }`.

## Task

1. `apps/api/src/index.ts`: drop the dead `prefix: '/api/v1/oncall'` option from the
   `app.register(oncallPoolsRoutes, { ... })` call.

## Non-goals

- No change to `oncall/pools.ts` (its type already accepts `{ database }` only).
- No route move, no prefix change.

## Acceptance

```bash
npm run check
```

## Handoff

- Files changed: `apps/api/src/index.ts`
- Interfaces added: none
- Verified: `npm run check`
- Follow-up WP: WP-M9-36 (comment route spam throttle, SEC-004, API side)
- Open question: none
