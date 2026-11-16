# WP-M14-80: the offer and assign actions in the database

format: small-model
status: planned
depends-on: WP-M14-79
phase: 14
milestone: m14
context-budget: 14k tokens
spec: specs/07-escalation.md §7.5, §7.6
spec-lines: 40

files-read:

- apps/api/src/db/migrations/0031_escalation_config.sql (the CHECK `escalation_actions_type_check`)
- apps/api/src/db/migrations/0042_escalation_action_status_change.sql (the widening of that CHECK)
- apps/api/src/db/migrations/meta/_journal.json
- apps/api/src/db/schema.ts (`escalationActions`, `tickets`, `users`)

files-write:

- apps/api/src/db/migrations/0043_escalation_action_offer_assign.sql, apps/api/src/db/migrations/meta/_journal.json
- apps/api/src/db/migrations/0044_ticket_assignees.sql
- apps/api/src/db/schema.ts

interfaces:

- `escalation_actions.type` allows `offer` and `assign` (the CHECK `escalation_actions_type_check` is widened)
- the new table `ticket_assignees` (`ticket_id`, `user_id`, `assigned_at`)

## Task

1. Migration `0043_escalation_action_offer_assign.sql`: drop the CHECK
   `escalation_actions_type_check` and recreate it with the two new types
   `offer` and `assign` — the same widening as WP-M14-40, without touching a row
   of an installed database. The target of an action lives in the `config` jsonb
   (`{ target: { kind, id } }`), so no column is added.
2. Migration `0044_ticket_assignees.sql`: the new table `ticket_assignees` with
   `ticket_id` (foreign key to `tickets`, `ON DELETE CASCADE`), `user_id`
   (foreign key to `users`, `ON DELETE CASCADE`), `assigned_at` and the primary
   key over `(ticket_id, user_id)`; the index over `user_id` for the tickets of a
   technician.
3. `apps/api/src/db/schema.ts`: the mirrored CHECK of `escalationActions` carries
   the six types and the new table `ticketAssignees` is declared.
4. The journal reaches `0044`.

## Non-goals

- No service, no shared contract, no UI (WP-M14-81 … WP-M14-85).
- No seed of assignees — the table is filled by the escalation (WP-M14-82).
- No change of the tickets table (`assigned_user_id` keeps its meaning).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the migrations apply on a throwaway database and the
existing database specs stay green.

## Handoff

- Files changed: the two migrations, the journal, the schema mirror
- Interfaces added: the action types `offer` and `assign`, the table
  `ticket_assignees`
- Verified:
- Follow-up WP: WP-M14-81 (the shared contracts)
- Open question: none
