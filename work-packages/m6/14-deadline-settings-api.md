# WP-M6-14: deadline and reaction settings contract

format: small-model
status: done
depends-on: WP-M6-03, WP-M6-08
phase: 6
milestone: m6
context-budget: 14k tokens
spec: specs/05-timeline.md §5.1; specs/07-escalation.md §7.1; ADR-0008
spec-lines: 40

files-read:

- packages/shared/src/escalation.ts (rule keys and defaults)
- packages/shared/src/schemas/settings.ts (schema style)
- apps/api/src/tickets/escalation.ts (`readOverrides`)

files-write:

- packages/shared/src/schemas/deadlines.ts
- packages/shared/src/schemas/index.ts
- apps/api/src/tickets/escalation.ts

interfaces:

- shared `deadlineSettingsSchema` / `DeadlineSettings`: `{ hours: { low, normal, high, critical }, reactionMinutes: { <rule>: { standard, critical } } }`
  for the four minute rules `new_without_review`, `work_order_without_distribution`,
  `offered_without_claim`, `assigned_without_accept`
- `readOverrides(database)` is exported from `tickets/escalation.ts`

## Task

1. Add `deadlineSettingsSchema` in `packages/shared/src/schemas/deadlines.ts`. Hours: integer 1–8760.
   Minutes: integer 1–10080. Every key is required.
2. Export it from `schemas/index.ts`.
3. Export `readOverrides` from `tickets/escalation.ts` (no other change).

## Non-goals

- No route, no UI (WP-M6-14b, WP-M6-15).
- No per-object-type (Objektart) values: no spec defines them; see the open question.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green.

## Handoff

- Files changed: shared deadline schema, its export, `readOverrides` export
- Interfaces added: `deadlineSettingsSchema`, `DeadlineSettings`
- Verified: typecheck, lint, test:run (670 tests), i18n:check, wp:check green; test:e2e skipped (no Chromium, unverified)
- Follow-up WP: WP-M6-14b (settings route and integration test)
- Open question: per-object-type deadlines (Objektart) are not defined by any spec or ADR; they need ADR-0012 before a WP can exist
