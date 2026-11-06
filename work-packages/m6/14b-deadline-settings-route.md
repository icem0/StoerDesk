# WP-M6-14b: deadline settings route and integration test

format: small-model
status: done
depends-on: WP-M6-14
phase: 6
milestone: m6
context-budget: 22k tokens
spec: specs/05-timeline.md §5.1; ADR-0008
spec-lines: 40

files-read:

- apps/api/src/settings/branding.ts (settings route pattern)
- apps/api/src/tickets/deadline.ts (`readDeadlineHours`)
- apps/api/src/tickets/escalation.ts (`readOverrides`, `escalationRulesFor`)

files-write:

- apps/api/src/settings/deadlines.ts
- apps/api/src/settings/__tests__/deadlines.integration.spec.ts
- apps/api/src/index.ts

interfaces:

- `GET /api/v1/settings/deadlines` — `settings.read`, answers the effective values
- `PUT /api/v1/settings/deadlines` — `settings.write`, replaces all values, answers the stored values

## Task

1. `apps/api/src/settings/deadlines.ts`:
   - GET: hours from `readDeadlineHours`; minutes from `escalationRulesFor('normal', overrides)` (standard)
     and `escalationRulesFor('critical', overrides)` (critical), converted from `thresholdMs` to minutes.
   - PUT: one transaction, upsert `ticket.deadline_hours.<priority>` and
     `ticket.escalation.<rule>.minutes` / `.critical_minutes` as bare numbers. Invalid body → `400 invalid_request`
     with `params.fields`.
2. Register the plugin in `apps/api/src/index.ts` next to the branding route.
3. Integration test: defaults on an empty table; PUT stores and GET returns the values; the scan helpers
   (`readDeadlineHours`, `readOverrides`) see them; office user gets `403` on PUT; `0` for an hour gets `400`.

## Non-goals

- No UI.
- No change of existing tickets: their stored deadline and escalation stay as they are.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the integration test skips only without PostgreSQL (reported as unverified then).

## Handoff

- Files changed: settings route, its integration test, route registration
- Interfaces added: `GET/PUT /api/v1/settings/deadlines`
- Verified: integration 6/6 green against PostgreSQL (skipped only without DB); typecheck, lint, test:run, wp:check green; test:e2e skipped (no Chromium, unverified)
- Follow-up WP: WP-M6-15 (deadline admin page)
- Open question: none
