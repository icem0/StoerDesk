# WP-M6-17: deadline hours readable for everyone who may create a ticket

format: small-model
status: done
depends-on: WP-M6-03, WP-M6-14
phase: 6
milestone: m6
context-budget: 16k tokens
spec: specs/05-timeline.md §5.1; ADR-0008
spec-lines: 35

files-read:

- packages/shared/src/schemas/deadlines.ts
- apps/api/src/settings/deadlines.ts
- apps/api/src/tickets/deadline.ts
- apps/api/src/settings/__tests__/deadlines.integration.spec.ts
- apps/api/src/settings/branding.ts

files-write:

- packages/shared/src/schemas/deadlines.ts
- apps/api/src/settings/deadlines.ts
- apps/api/src/settings/__tests__/deadlines.integration.spec.ts

interfaces:

- `GET /api/v1/settings/deadline-hours` — `ticket.create`, answers the effective
  deadline hours per priority as `{ low, normal, high, critical }`.
- `deadlineHoursSchema` / `DeadlineHours` in shared.

## Task

1. Split the `hours` object out of `deadlineSettingsSchema` into an exported
   `deadlineHoursSchema` and `DeadlineHours` type; the settings schema reuses it.
2. Add `GET /api/v1/settings/deadline-hours` next to the existing settings route.
   Guard it with `ticket.create`, because `reporter_internal` holds that
   permission but not `settings.read`, and answer `readDeadlineHours`.
3. Extend the integration test: a `reporter_internal` user reads the defaults and
   a stored override, while an anonymous request answers `401`.

## Non-goals

- No write access for ticket creators.
- No change to the stored keys or the calculation.
- No UI change (WP-M6-18).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Integration tests skip only without PostgreSQL.

## Handoff

- Files changed: shared deadline schema, the settings route, its integration test
- Interfaces added: `GET /api/v1/settings/deadline-hours`, `deadlineHoursSchema`
- Verified: `npm run typecheck --workspaces --if-present`, `npm run lint` (0 errors, 7 pre-existing warnings), `npx vitest run apps/api/src/settings/__tests__/deadlines.integration.spec.ts` (skipped without PostgreSQL), `npm run wp:check`
- Follow-up WP: WP-M6-18 (`m6/18-priority-deadline-hint.md`)
- Open question: none
