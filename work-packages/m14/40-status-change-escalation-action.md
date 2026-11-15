# WP-M14-40: status_change as an escalation action — the database layer

format: small-model
status: done
depends-on: WP-M14-39b
phase: 14
context-budget: 14k tokens
spec: specs/07-escalation.md §7.5, §7.6, §7.12, §7.13
spec-lines: 60

files-read:

- apps/api/src/db/migrations/0031_escalation_config.sql (`escalation_actions`, the CHECK `escalation_actions_type_check`)
- apps/api/src/db/schema.ts (`escalationActions`)
- apps/api/src/db/migrations/meta/_journal.json
- apps/api/src/db/migrations/0041_ticket_transitions.sql (`ticket_statuses`, `ticket_transitions`)

files-write:

- apps/api/src/db/migrations/0042_escalation_action_status_change.sql, apps/api/src/db/migrations/meta/_journal.json
- apps/api/src/db/schema.ts
- specs/07-escalation.md (the `status_change` row of §7.5, the replaced boundary of §7.12)

interfaces:

- `escalation_actions.type` allows `status_change` (the CHECK `escalation_actions_type_check` is extended)
- the target status of a `status_change` action lives in the `config` jsonb (`{ toStatus }`), no new column

## Task

1. Migration `0042_escalation_action_status_change.sql` on the tables of `0031`
   (`0036` is taken by `0036_notification_verification.sql`, so the chain continues
   at `0042`): drop `escalation_actions_type_check` and recreate it with the fourth
   type `status_change`. No new column — the target status of the action lives in
   the `config` jsonb, so a removed status still leaves the firing log and the
   action rows readable.
2. Mirror the CHECK in `apps/api/src/db/schema.ts` and register the migration in
   `_journal.json` (idx 42).
3. Extend `specs/07-escalation.md`: §7.5 gains the row `status_change` —
   `to_status` names a row of `ticket_statuses` — and the effect: the dispatcher
   performs the step of the `ticket_transitions` table from the current status to
   that target through `transitionTicket()` (§7.13, WP-M14-38c); §7.12 replaces
   the boundary „the escalation never changes a ticket state" with the rule that
   only a `status_change` action may move the status, never the assignment, the
   priority or the deadline.
4. Bookkeeping: the backlog rows of `work-packages/README.md` (40 done, 40b/40c
   planned), one `docs` entry in `CHANGELOG.md`, `PLAN.md` §16, the module row of
   `docs/REPO-MAP.md`.

## Non-goals

- No shared contract, no seed, no service, engine, route or UI change (WP-M14-40b,
  WP-M14-40c). No evaluation of `condition_json` (WP-M14-41).
- No new `escalation_actions` column and no foreign key: jsonb cannot carry one, the
  service validates the target status against `ticket_statuses` (WP-M14-40b).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
npm run db:migrate -w @stoerdesk/api
```

Expected: all green; the migration applies to an installed database without
touching a row; the journal reaches `0042`; no existing installation loses an
action row, because `status_change` only widens the CHECK.

## Handoff

- Files changed: the migration, the journal, the schema, the spec
- Interfaces added: the fourth action type `status_change` with the `toStatus` in
  the `config` jsonb
- Verified: typecheck, ESLint, vitest, i18n, wp:check (`db:migrate` runs only where
  a database is reachable)
- Follow-up WP: WP-M14-40b (the shared contract and the status-change dispatch in
  the engine), then WP-M14-40c (the administration offers the action)
- Open question: does a `status_change` write the workflow columns of `PLAN.md` §7
  or only the status — resolved in WP-M14-40b: the action performs a step of the
  transition table through `transitionTicket()`, so the columns stay keyed by the
  `event_key` of that step (WP-M14-38c).
