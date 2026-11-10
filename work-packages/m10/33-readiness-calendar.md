# WP-M10-33: the readiness calendar of the office

format: small-model
status: planned
depends-on: WP-M10-32
phase: 10
milestone: m10
context-budget: 18k tokens
spec: specs/04-oncall.md §4a.4, §4a.7; PLAN.md §8, §14
spec-lines: 60

files-read:

- apps/web/src/features/oncall/my-shifts-page.tsx (the current on-call page)
- apps/web/src/admin/oncall-page.tsx (the plan administration)
- apps/api/src/oncall/routes.ts (the shift and member routes)
- apps/web/src/i18n/locales/de/oncall.json (the on-call labels)
- specs/04-oncall.md (§4a.4 the self-service page)

files-write:

- apps/web/src/features/oncall/readiness-calendar.tsx
- apps/web/src/i18n/locales/de/oncall.json
- apps/web/src/i18n/locales/en/oncall.json

interfaces:

- `ReadinessCalendar({ shifts, pools })` — the week of the readiness plan with the technician of every shift
- `oncall.readiness.*` — the labels of the calendar in `de` and `en`

## Task

The office wants a readiness calendar that shows everybody who has the
readiness — not only the own shifts.

1. `apps/web/src/features/oncall/readiness-calendar.tsx` renders the shifts
   of the selected week: every row names the pool, the technician and the
   time span of the shift and shows its state. The technician name comes from
   the pool members (`GET /api/v1/oncall/pools/:id/members`), a shift without
   a technician is marked as unassigned.
2. The calendar has its own week navigation (previous and next week) and a
   heading with the week; the first week is the current one.
3. The component takes the shifts and the pools as arguments and fetches
   nothing itself, so the page keeps the single source of truth for the data.
4. The labels live under `oncall.readiness.*` in `de` and `en`; no literal
   string in the component.

## Non-goals

- No change of the on-call API and no new route.
- No change of the own readiness (the shifts of the signed-in user) — it moves
  below the calendar in WP-M10-34.
- No change of the administration page `/admin/oncall`.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the locale files carry the new keys in `de` and `en`.

## Handoff

- Files changed: the new calendar component, both on-call locale files
- Interfaces added: `ReadinessCalendar`, `oncall.readiness.*`
- Verified: typecheck, lint, test:run, i18n:check, wp:check
- Follow-up WP: WP-M10-34 (the on-call page) — the file exists in this commit
- Open question: none
