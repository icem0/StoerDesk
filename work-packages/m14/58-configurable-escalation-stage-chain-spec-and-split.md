# WP-M14-58: Configurable escalation stage chain — specification, ADR-0023 and phase split

format: small-model
status: done
depends-on: WP-M13-03, WP-M13-04, WP-M13-05, WP-M13-14
phase: 14
context-budget: 24k tokens
spec: PLAN.md §6, §9, §16, §17, §19; specs/07-escalation.md §7.1, §7.3, §7.6, §7.9
spec-lines: 190

files-read:

- PLAN.md (§6 data model, §9 escalation, §16 state, §17 limits, §19 open decisions)
- specs/07-escalation.md (the phase-13 contract)
- docs/DECISIONS/0017-workflow-stages-as-escalation-stages.md, docs/DECISIONS.md
- packages/shared/src/schemas/escalation-config.ts (`ESCALATION_STAGE_KEYS`, the stage schema, the defaults)
- apps/api/src/escalation/config.ts, apps/api/src/tickets/escalation.ts
- apps/api/src/db/migrations/0031_escalation_config.sql, apps/api/src/db/schema.ts

files-write:

- specs/07-escalation.md (the new §7.11, §7.12 Boundaries)
- docs/DECISIONS/0023-escalation-stage-chain-configurable.md, docs/DECISIONS.md
- PLAN.md (§6, §9, §16, §19)
- work-packages/m14/ (this file plus `59` … `67`, each file in this commit), work-packages/README.md, CHANGELOG.md

interfaces:

- `specs/07-escalation.md` §7.11 — stage rows, the predecessor chain, the clock, the cascade
- `docs/DECISIONS/0023-escalation-stage-chain-configurable.md` — the decision, the rejected alternatives, the consequences
- `validateEscalationStageChain(stages, events)` — the pure chain validator announced for WP-M14-60

## Task

1. Extend `specs/07-escalation.md` with §7.11: a stage is a row with a free `key`,
   a nullable `predecessor` and a `reached_by` event list; `PUT /api/v1/escalation/stages`
   replaces the whole set (max. 20 stages) in one transaction; the chain is
   validated (unique keys, predecessor exists, no cycle, order consistent with
   `position`); the predecessor carries the clock; a stage rule fires while its
   stage is not reached; removing a stage removes its rules through a foreign key
   with `ON DELETE cascade`.
2. Add ADR-0023 and its row in `docs/DECISIONS.md`; mark the decision 1 of ADR-0017
   as superseded in its index row.
3. Update `PLAN.md`: the escalation tables of §6, the chain paragraph of §9, the
   phase 14 row of §16, the current state and the resolved open decision of §19.
4. Announce the split: the documents `59-escalation-stage-chain-in-the-database.md`
   … `67-configurable-stage-chain-exit-criterion.md` exist in this commit; the
   backlog of `work-packages/README.md` gets the ten rows: database → shared
   contracts → seed → stage-set API → engine → available stages → administration
   UI and texts → page tests → exit criterion.
5. Bookkeeping: one `docs` entry in `CHANGELOG.md`. No product code in this WP.

## Non-goals

- No schema, seed, service, route, job, UI or test code (WP-M14-59 … WP-M14-67).
- No change to the workflow state machine itself (WP-M14-38 owns the transitions).
- No second definition of the stage chain outside the spec and the ADR.

## Acceptance

```bash
npm run wp:check
npm run check
git grep -n "WP-M14-58\|WP-M14-59\|WP-M14-67" -- work-packages/ specs/ PLAN.md docs/
```

Expected: `wp:check` green with the ten new documents valid; `check` green because
the package changes documentation only; the grep shows the split and its backlog rows.

## Handoff

- Files changed: the spec, the ADR, the plan, this document, the nine sibling
  documents, the backlog and the changelog
- Interfaces added: the contracts of `specs/07-escalation.md` §7.11
- Verified: `npm run wp:check`, `npm run check`
- Follow-up WP: WP-M14-59 … WP-M14-67 (each file exists in this commit)
- Open question: none — the cascade of a removed stage and the multi-root chain are
  decided in ADR-0023
