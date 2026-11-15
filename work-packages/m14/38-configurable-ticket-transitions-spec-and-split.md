# WP-M14-38: The configurable ticket transitions — spec, ADR-0025 and the split

format: small-model
status: done
depends-on: WP-M14-37
phase: 14
context-budget: 22k tokens
spec: PLAN.md §7, §16, §17, §19; specs/07-escalation.md §7.1, §7.10; specs/02-data-model.md §4.8
spec-lines: 130

files-read:

- PLAN.md (§6 data model, §7 ticket workflow, §16 state, §17 limits, §19 open decisions)
- apps/api/src/tickets/workflow.ts (`TRANSITIONS`, `transitionTicket`, `TRANSITION_EVENT_KEYS`)
- apps/api/src/db/schema.ts (`ticketStatuses`, `tickets_status_check`), specs/02-data-model.md §4.8
- apps/api/src/db/migrations/0034_ticket_statuses.sql, 0040_ticket_status_key_format.sql
- apps/api/src/tickets/status-service.ts (the status service and its errors of WP-M14-36)
- specs/07-escalation.md §7.1, §7.10, docs/DECISIONS.md, docs/DECISIONS/0023-escalation-stage-chain-configurable.md

files-write:

- specs/07-escalation.md (the new §7.13, the §7.10 sentence), docs/DECISIONS/0025-ticket-transitions-as-database-configuration.md, docs/DECISIONS.md
- PLAN.md (§6, §16, §19), work-packages/README.md, CHANGELOG.md
- work-packages/m14/38-configurable-ticket-transitions-spec-and-split.md (this file)
- work-packages/m14/38a-ticket-transition-table-in-the-database.md, 38b-transition-contracts-and-the-transition-service.md, 38c-the-workflow-engine-reads-the-transition-table.md, the `depends-on` line of WP-M14-39

interfaces:

- `ticket_transitions { from_status, to_status, event_key, condition_json, active }` — the row shape of §7.13
- `transitionTicket(ctx)` reads the table, `TicketTransitionError` answers 409 `invalid_transition`
- `readTicketTransitions(database)`, `resolveTransition(transitions, fromStatus, event)`
- ADR-0025 (`docs/DECISIONS/0025-ticket-transitions-as-database-configuration.md`)

## Task

1. Extend `specs/07-escalation.md` with §7.13: the steps of the workflow are the
   rows of `ticket_transitions` (migration `0041`), both statuses are foreign keys
   to `ticket_statuses.key` with `ON DELETE cascade`, `event_key` is unique per
   `from_status`, `condition_json` is stored now and evaluated only from WP-M14-41,
   the wildcard `cancelled` becomes one row per status, the migration seeds the 22
   rows of `PLAN.md` §7 plus the nine status rows the foreign keys need
   (idempotently), `tickets_status_check` of migration `0004` is dropped (ADR-0025
   decision 5) and the §7.10 sentence about the transition map is corrected.
2. Write ADR-0025 (the table, the cascade, the seeded default workflow, the DB-driven
   `transitionTicket()`, the rejected `tickets.status` foreign key) and index it in
   `docs/DECISIONS.md`.
3. Update `PLAN.md`: the transition rows in §6, the phase-14 state in §16 (WP-M14-38
   is split, its children stay open in numeric order), the open transition shape in
   §19 resolved by ADR-0025; add the three backlog rows and one changelog entry.
4. Announce the split: `38a-…`, `38b-…` and `38c-…` exist in this commit (database →
   shared contracts and service → engine); WP-M14-39 now depends on WP-M14-38c.
5. Bookkeeping: one `docs` entry in `CHANGELOG.md`. No product code in this WP.

## Non-goals

- No schema, service, route, job, UI or test code — this package changes documents only.
- No transition API or UI (WP-M14-39, WP-M14-39b), no escalation action
  `status_change` (WP-M14-40), no evaluation of `condition_json` (WP-M14-41).
- No second definition of the transitions outside §7.13, the ADR and the migration.

## Acceptance

```bash
npm run wp:check
npm run check
git grep -n "ADR-0025\|WP-M14-38" -- docs specs PLAN.md work-packages
```

Expected: all green — `wp:check` reports the four documents valid; `check` stays green
because no source file changes; the grep shows the ADR, the spec rules and the backlog
rows.

## Handoff

- Files changed: the spec slice, ADR-0025 and its index, PLAN.md, this document, the three
  child documents, the `depends-on` line of WP-M14-39, the backlog, the changelog
- Interfaces added: the row shape of §7.13, the interfaces announced for WP-M14-38b/38c
- Verified:
- Follow-up WP: WP-M14-38a (`38a-ticket-transition-table-in-the-database.md`), WP-M14-38b,
  WP-M14-38c (each file exists in this commit)
- Open question: none — the wildcard expansion, the seed location and the `tickets.status`
  foreign key are decided in ADR-0025
