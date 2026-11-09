# WP-M9-09: token-protected TV snapshot route

format: small-model
status: planned
depends-on: WP-M9-05, WP-M9-08
phase: 9
milestone: m9
context-budget: 14k tokens
spec: specs/11-dashboard.md §11.7; ADR-0012 decisions 4 and 5
spec-lines: 55

files-read:

- specs/11-dashboard.md (§11.7 wall display)
- apps/api/src/settings/dashboard.ts (`readDashboardSettings`, `verifyTvToken`)
- apps/api/src/dashboard/service.ts (snapshot builder)
- apps/api/src/dashboard/routes.ts (route plugin style)
- apps/api/src/tickets/status.ts (public route without a session)
- apps/api/src/index.ts (route registration)

files-write:

- apps/api/src/dashboard/tv-routes.ts
- apps/api/src/index.ts
- apps/api/src/dashboard/__tests__/tv.routes.integration.spec.ts

interfaces:

- `tvRoutes` — `GET /api/v1/tv/:token`, no session
- `anonymizeObjectNames(snapshot)` — stable pseudonyms derived from the object id
- `404 tv_not_found` for a wrong, missing or rotated token

## Task

1. Add `apps/api/src/dashboard/tv-routes.ts`: verify `:token` through
   `verifyTvToken` before any snapshot query; a wrong, missing or rotated token
   answers `404 tv_not_found` and reveals no data.
2. Build the snapshot with `onCall.phone = null` and `channels = null`; the wall
   display never carries contact data or channel detail.
3. When `dashboard.tv_anonymize` is true, replace every `objectName` with a
   stable pseudonym derived from the object id, so the same object keeps its
   label across polls, while ticket number, status, priority and deadline stay
   visible.
4. Register `tvRoutes` in `apps/api/src/index.ts` on the public side.
5. Add a route test: a valid token answers the snapshot, a wrong token answers
   `404 tv_not_found`, the phone is always null, and anonymisation replaces the
   object name but not the ticket number.

## Non-goals

- No SSE and no session cookie; the TV page polls (WP-M9-16).
- No rotation route; rotation is WP-M9-08.
- No per-token display name or audit log.
- No PII beyond the on-call name; the phone stays null.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the TV route test runs against a throwaway database and
skips with a named reason otherwise.

## Handoff

- Files changed: the TV route plugin, the server registration, the TV route test
- Interfaces added: `GET /api/v1/tv/:token`
- Verified: typecheck, lint, test:run, wp:check
- Follow-up WP: WP-M9-16 (web wall display)
- Open question: none
