# WP-M14-79: the spec and the decision of the offer and assign actions

format: small-model
status: planned
depends-on: WP-M14-41
phase: 14
milestone: m14
context-budget: 18k tokens
spec: specs/07-escalation.md §7.5, §7.12
spec-lines: 45

files-read:

- specs/07-escalation.md (§7.5 actions, §7.12 boundaries)
- specs/02-data-model.md (§4.8 tickets, §4.12 tables of later phases)
- apps/api/src/db/schema.ts (`escalationActions`, `oncallPools`, `groups`, `userGroups`)
- apps/api/src/oncall/coupling.ts (`offerTicket`, `resolveOnCallPerson`)
- docs/DECISIONS/0025-ticket-transitions-as-database-configuration.md

files-write:

- specs/07-escalation.md
- specs/02-data-model.md
- docs/DECISIONS/0026-the-escalation-offers-and-assigns-tickets.md, docs/DECISIONS.md
- PLAN.md (§9 the two new actions, §16 the record of the series)

interfaces:

- two new escalation action types: `offer` and `assign`
- the target of both actions: `{ kind: 'pool' | 'group', id: uuid }`
- the new table `ticket_assignees` (the technicians a ticket is assigned to)

## Task

1. `specs/07-escalation.md` §7.5 gains the two action rows with their
   configuration (`target`) and their effect, §7.12 replaces the boundary „no
   action changes an assignment" with the rule of ADR-0026, and the new §7.14
   describes the target, the effect on the ticket and the notification rule.
2. `specs/02-data-model.md` gains §4.13 for the new table `ticket_assignees` with
   its columns and its relations.
3. `docs/DECISIONS/0026-the-escalation-offers-and-assigns-tickets.md` decides:
   the target is a readiness pool or a user group, the assignment is recorded in
   `ticket_assignees`, the offer follows the on-call coupling of a pool, the
   broadcast reaches the members on their own channels.
4. `docs/DECISIONS.md` gains the index row of ADR-0026; `PLAN.md` §9 names the
   two new actions and §16 records the series.

## Non-goals

- No product code, no migration, no shared contract (WP-M14-80 … WP-M14-85).
- No manual distribution in the ticket view (the stage selection of §7.10 stays).
- No per-user routing for the channels other than ntfy (a named limitation).

## Acceptance

```bash
npm run i18n:check
npm run wp:check
```

Expected: all green; the spec names the two actions, their configuration and
their effect, and the ADR carries the decision with its alternatives.

## Handoff

- Files changed: the escalation spec, the data model spec, the ADR and its index
- Interfaces added: the action types `offer` and `assign`, the target union,
  the table `ticket_assignees`
- Verified: `npm run wp:check`, `npm run i18n:check`
- Follow-up WP: WP-M14-80 (the database), WP-M14-81 (the shared contracts),
  WP-M14-82 (the engine), WP-M14-83 (the configuration service), WP-M14-84 (the
  administration UI) and WP-M14-85 (the assignees in the ticket view) — every
  file exists in this commit
- Open question: none — the office answered the two questions of the target (a
  readiness pool or a user group) and of the assignment (all technicians of the
  target)
