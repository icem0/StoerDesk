# WP-M14-154a: the shift history route names the people and the step

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 18k tokens
spec: specs/04-oncall.md §4a.3, §4a.4, §4a.5, §4a.8, §4a.10
spec-lines: 40

depends-on: WP-M14-154

files-read:

- apps/api/src/oncall/events.ts (`appendOncallEvent`, the event row)
- apps/api/src/oncall/routes.ts (the shift routes, `shiftRow`, `requireShift`)
- packages/shared/src/schemas/oncall.ts (`oncallShiftSchema`, `memberRow`)
- apps/api/src/db/schema.ts (`oncallEvents`, `users`)
- apps/api/src/oncall/__tests__/routes.integration.spec.ts (the shift fixtures)
- specs/04-oncall.md §4a.10 (the answer of the history)

files-write:

- packages/shared/src/schemas/oncall.ts
- apps/api/src/oncall/events.ts
- apps/api/src/oncall/routes.ts
- apps/api/src/oncall/__tests__/routes.integration.spec.ts

interfaces:

- `GET /api/v1/oncall/shifts/:id/history` — `{ events: oncallShiftHistoryEntry[] }`
- `readShiftHistory(database, shiftId)` — oldest first
- `oncallShiftHistoryEntrySchema` — `id`, `type`, `createdAt`, `actor`,
  `person`, `fromState`, `toState`, `reason`

## Task

1. `packages/shared/src/schemas/oncall.ts`: add
   `oncallShiftHistoryEntrySchema` (`id`, `type` as string, `createdAt`,
   `actor` and `person` as `memberRow` nullable, `fromState` and `toState` as
   `shiftState` nullable, `reason` as string nullable) and
   `oncallShiftHistoryResponseSchema` with `{ events: [...] }`.
2. `apps/api/src/oncall/events.ts`: add `readShiftHistory(database, shiftId)`.
   It reads the events of the shift ordered by `createdAt` and `id`, collects
   the actor ids and the payload ids (`userId`, `targetUserId`,
   `acceptedByUserId`, `approvedByUserId`, `rejectedByUserId`,
   `cancelledByUserId`), reads their display data in one `inArray` select and
   answers the normalized entries. `person` is the assignee of
   `shift_created`/`shift_updated`/`swap_approved`, the target of
   `swap_requested` and otherwise `null`; `fromState`/`toState` come from the
   payload of an assignment when both are known shift states; `reason` comes
   from a decline. The raw payload never leaves this function.
3. `apps/api/src/oncall/routes.ts`: add the route behind `oncall.read`, with a
   UUID-format check of `:id` (`400 invalid_request`), the existing
   `requireShift` existence check (`404 oncall_shift_not_found`) and the
   parsed response schema.
4. The routes integration spec proves the anonymous `401`, the missing
   permission `403`, the unknown shift `404`, the event order, the actor of a
   confirmation and the assignee and state transition of an assignment.

## Non-goals

- No new table and no migration: `oncall_events` already carries every step;
  only the attribution of the create and generate event moves to the session
  user.
- No name gate in the API: the route follows the shift list and answers the
  people to `oncall.read`; the web app gates `oncall.read_names`.
- No UI in this WP — WP-M14-154b renders the dialog.
- No change of the delete rule: a deleted shift still takes its events with it.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the new route test proves the named history of a confirmed
and reassigned shift.

## Handoff

- Files changed: the shared on-call contract, the history reader, the route,
  the routes integration spec, `specs/04-oncall.md` §4a.10 and §4a.8,
  `work-packages/README.md`, this document
- Interfaces added: `oncallShiftHistoryEntrySchema`,
  `oncallShiftHistoryResponseSchema`, `readShiftHistory`,
  `GET /api/v1/oncall/shifts/:id/history`
- Verified: targeted API suite, typecheck, lint, `npm run wp:check`
- Follow-up WP: WP-M14-154b
- Open question: none
