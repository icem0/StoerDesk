# WP-M14-30: An assigned readiness can be accepted

format: small-model
status: planned
depends-on: WP-M14-29
phase: 14
milestone: m14
context-budget: 18k tokens
spec: specs/04-oncall.md §4a.3, §4a.4 (ADR-0021)
spec-lines: 40

files-read:

- apps/api/src/oncall/confirm.ts (`CONFIRMABLE_STATES`, `DECLINEABLE_STATES`)
- apps/web/src/features/oncall/my-shifts-page.tsx (the action buttons per state)
- apps/web/src/features/oncall/use-shift-actions.ts (`confirm`)
- apps/api/src/oncall/__tests__/confirm.integration.spec.ts (the route test pattern)

files-write:

- apps/api/src/oncall/confirm.ts
- apps/web/src/features/oncall/my-shifts-page.tsx
- apps/api/src/oncall/__tests__/confirm.integration.spec.ts

interfaces:

- `CONFIRMABLE_STATES` — `DRAFT` and `PLANNED`
- the readiness page — the confirm button for a `DRAFT` shift of the own technician

## Task

1. `apps/api/src/oncall/confirm.ts`: add `DRAFT` to `CONFIRMABLE_STATES` so the assigned
   technician (or an admin) can accept their assigned readiness; the decline rule, the
   `oncall_shift_started` rule and the single `confirmed` event with the `client_uuid`
   idempotency stay.
2. `apps/web/src/features/oncall/my-shifts-page.tsx`: render the confirm button for a `DRAFT`
   shift of the own technician next to `PLANNED`; the decline and the swap buttons keep their
   states, and a `DRAFT` shift of another technician still shows no action.
3. Extend `confirm.integration.spec.ts`: a `DRAFT` shift answers `200` with the shift in
   `CONFIRMED` and `confirmed_at` set, a repeat with the same `clientUuid` writes no second
   event, and a `DECLINED` or `UNFILLED` shift still refuses.

## Non-goals

- No coupling change: a `DRAFT` shift that is neither confirmed nor published still never
  counts for the on-call person.
- No i18n key and no new state: the state labels exist already.
- No change of the publish action of the admin grid (WP-M8-13).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run -- apps/api/src/oncall/__tests__/confirm.integration.spec.ts
npm run wp:check
```

Expected: all green; the extended spec fails before the change and passes after it.

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: WP-M14-31 (`31-unconfirmed-readiness-reminder.md`)
- Open question: none
