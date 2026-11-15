# ADR-0025: The ticket transitions are database configuration

- Status: accepted
- Date: 2026-11-15
- Stakeholders: office, manager, admin

## Context

WP-M14-35 moved the ticket **statuses** into the `ticket_statuses` table and
WP-M14-36/37 let the administration create, rename and delete them. The steps
between the statuses stayed the code map `TRANSITIONS` in
`apps/api/src/tickets/workflow.ts`: a status an administrator adds has no step
into it and none out of it, so no ticket can ever carry it — and the CHECK
`tickets_status_check` of migration `0004` still limits `tickets.status` to the
nine keys, which contradicts the configurable statuses of §7.1 since WP-M14-35.

`specs/07-escalation.md` §7.10 named the transition map as code-only, and
ADR-0023 made the escalation stage chain configurable whose `reached_by` entries
reference the workflow events. For a workflow that can be changed in the
administration — the office asked for an intermediate dispatch step — the steps
have to be rows like the stages and the statuses.

## Decision

1. **`ticket_transitions` is a table** (migration `0041`): `from_status` and
   `to_status` are foreign keys to `ticket_statuses.key` with `ON DELETE cascade`
   — deleting a status deletes its steps — plus `event_key` (text), `condition_json`
   (nullable jsonb, stored now and evaluated only by WP-M14-41) and `active`
   (boolean). Unique index over `(from_status, event_key)`: one event performs at
   most one step from a status.
2. **The wildcard row `'*'` becomes one row per status.** The old map allowed
   `cancelled` from every status; a foreign key forbids a `*` key and a Postgres
   unique index would allow several NULL rows, so the wildcard is expanded into
   the nine `cancelled` rows.
3. **The migration seeds the `PLAN.md` §7 workflow** — those 22 rows — so an
   installed instance keeps exactly the workflow it has today. The seed lives in
   the migration and not only in a runtime seed function: every integration spec
   applies the migrations and only some of them call a seed function, so the
   workflow of a migrated database must be complete. The foreign keys additionally
   need the nine status rows, so the migration seeds them idempotently as well
   (`ON CONFLICT (key) DO NOTHING`); `apps/api/src/db/seed/statuses.ts` stays the
   idempotent bootstrap of the API start and must agree with those rows. Both seed
   steps are idempotent, so an installed instance keeps what it has.
4. **`transitionTicket()` reads the table.** The row of `(current status, event)`
   decides the new status; unknown or inactive combinations throw
   `TicketTransitionError` (HTTP 409 `invalid_transition`). The UPDATE still
   re-checks `status = <from>`, so the atomic acceptance rule of `PLAN.md` §12
   stays. The workflow columns stay keyed by `event_key`.
5. **`tickets_status_check` is dropped in `0041`.** A foreign key from `tickets.status`
   onto `ticket_statuses.key` was rejected: a deactivation keeps rows and a ticket
   keeps its status key as history, so the key on the ticket stays plain text and
   the rows of `ticket_statuses` are the configuration.

## Alternatives

- **Keep the transition map in code.** Rejected: the statuses are already rows, so
  every new status would be unreachable and the map would be a second definition
  of the workflow.
- **A JSON map in `settings`.** Rejected: no foreign key to the statuses, no
  unique step per event, no per-row administration.
- **A foreign key from `tickets.status`.** Rejected under decision 5: it couples
  every ticket row to the status table and turns a deactivation or a rename into
  a question about existing rows.
- **Evaluate `condition_json` now.** Rejected for this decision: time-based
  conditions belong to WP-M14-41, and evaluating them before the escalation
  actions of WP-M14-40 would change two layers in one step.

## Consequences

- An installation whose transition rows are all deleted has no workflow any more;
  the transition administration (WP-M14-39) keeps that trade-off visible.
- The escalation layer still reads the code map: `TRANSITIONS` and
  `TRANSITION_EVENT_KEYS` in `apps/api/src/tickets/workflow.ts` feed
  `apps/api/src/escalation/config.ts` (the stage chain validation of ADR-0023,
  `readReachableStages` of §7.10). Those views switch to the table in WP-M14-40
  and WP-M14-41, so after an administrator edited the rows the ticket view can
  offer a stage whose event the engine rejects.
- `tickets.status` loses its CHECK, so an unknown key on a ticket is only caught
  by the rows of `ticket_statuses` and the services — the status administration
  already refuses an unused key (`404 status_not_found`).
