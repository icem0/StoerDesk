# WP-M8-14b: on-call self-service read routes

format: small-model
status: planned
depends-on: WP-M8-12
phase: 8
milestone: m8
context-budget: 18k tokens
spec: specs/04-oncall.md §4a.7, §4a.5
spec-lines: 60

files-read:

- specs/04-oncall.md (§4a.7 personal iCal feed, §4a.5 swap requests)
- apps/api/src/oncall/routes.ts (on-call shift/settings routes)
- apps/api/src/db/schema.ts (users, userRoles, userGroups, roles, oncallPools)
- packages/shared/src/schemas/oncall.ts (shared on-call response schemas)
- apps/api/src/oncall/__tests__/ical.integration.spec.ts (fixture pattern)

files-write:

- packages/shared/src/schemas/oncall.ts
- apps/api/src/oncall/routes.ts
- apps/api/src/oncall/__tests__/self-service.integration.spec.ts

interfaces:

- `GET /api/v1/oncall/ical-url` (`oncall.read`) → `{ url }` for the personal iCal feed
- `GET /api/v1/oncall/pools/:id/members` (`oncall.read`) → pool members eligible for a swap
- `oncallUrlResponseSchema`, `oncallMemberSchema`, `oncallMemberListResponseSchema`

## Task

1. Add shared response schemas for the iCal URL and the pool-member list.
2. Add `GET /api/v1/oncall/ical-url`: guards `oncall.read`, signs the session user id
   with `icalTokenFor` and answers `{ url: '/api/v1/oncall/ical/<token>.ics' }` — a
   relative path the page resolves against its own origin; never returns or logs
   the token itself.
3. Add `GET /api/v1/oncall/pools/:id/members`: guards `oncall.read`, resolves pool
   membership like `requestSwap` (group members, or every active `oncall` user for
   group-less pools) and answers `{ members: [{ id, givenName, familyName, email }] }`.
   Missing pool answers `404 oncall_pool_not_found`.
4. Integration test for both routes (skips without PostgreSQL): a technician sees
   their iCal URL and the pool members of their shift's pool; unknown pool gets 404;
   `oncall.read`-less user gets 403.

## Non-goals

- No UI (WP-M8-14 consumes these routes).
- No write access, no token storage, no feed expiry or rotation.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the integration tests skip with a named reason without
PostgreSQL (reported as unverified).

## Handoff

- Files changed: the shared on-call schemas, `oncallRoutes`, one integration test
- Interfaces added: `GET /api/v1/oncall/ical-url` and `GET /api/v1/oncall/pools/:id/members`
- Verified: typecheck, lint, test:run (focused), i18n:check, wp:check
- Follow-up WP: WP-M8-14 (my-shifts page)
- Open question: none
