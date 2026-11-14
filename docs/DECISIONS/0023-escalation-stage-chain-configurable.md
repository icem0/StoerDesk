# ADR-0023: The escalation stage chain is configurable

- Status: accepted
- Date: 2026-11-14
- Stakeholders: office, manager, admin
- Supersedes: decision 1 of ADR-0017 (the stage count and the stage keys stay
  fixed); every other decision of ADR-0017 stays valid.

## Context

ADR-0017 made the escalation stages the five milestones of the ticket workflow
and rejected a free stage catalogue, because the catalogue was a second
hierarchy next to the workflow. `PUT /api/v1/escalation/stages` only renames,
reorders and deactivates the five fixed keys
(`packages/shared/src/schemas/escalation-config.ts`, the CHECK
`escalation_stages_key_check` of migration `0031`), so an installation cannot
add or remove a stage.

The office asked for the other shape: the number of escalation stages must be
configurable. When a dispatch needs an intermediate step between two existing
ones, the administrator adds one stage; when a step does not apply to the
installation, the administrator removes it. Every stage names its predecessor —
the step whose completion starts the waiting clock of this stage — and a stage
may name no predecessor at all, which means its clock starts at the report.

The clock of a rule and the stage of a rule were already configurable
(`escalation_rules.reference`, `escalation_rules.stage_key`); what is missing is
the set of stages itself and the chain between them.

## Decision

1. **A stage is a row, not a key of an enum.** `escalation_stages.key` is a free
   key (`^[a-z][a-z0-9_]{0,39}$`), unique, the identity of the stage; the CHECK
   over the five fixed keys is gone. A stage carries `predecessor` (nullable, a
   foreign key to the key of a stage) and `reached_by` (jsonb, an array of
   transition event keys, may be empty).
2. **`PUT /api/v1/escalation/stages` replaces the whole stage set** — at most
   20 stages. A stage that is not in the body is deleted; a stage whose key was
   not used before is created. Names, position, active flag, predecessor and
   reaching events are sent with every row.
3. **The chain is validated server-side**, by one pure function in
   `packages/shared` (`validateEscalationStageChain`): unique keys, a
   predecessor that exists and is not the stage itself, no cycle, the position
   of a stage greater than the position of its predecessor, `reached_by`
   entries being event keys of the transition map. A violation answers
   `400 invalid_request` with the field paths and writes nothing.
4. **The predecessor carries the clock.** A stage without predecessor waits from
   `received_at`; a stage with predecessor P waits from the moment P was
   reached, which is the latest event of P's `reached_by`. A rule of that stage
   may keep its explicit `reference`; when it does, the reference must match the
   clock of its stage, and `null` means "take the clock of the stage".
5. **A rule of a stage fires while its stage is not reached** and its clock
   passed the deadline. "Reached" means one event of `reached_by` in the ticket
   events. This replaces the status gate (`WAITING_STATUS_BY_REFERENCE` and the
   hard-coded `STAGE_EVENTS` map) for stage rules; the deadline rules keep their
   timeline clock.
6. **Removing a stage removes its rules.** `escalation_rules.stage_key` becomes a
   real foreign key with `ON DELETE cascade` to `escalation_stages.key`; the
   actions cascade further through `escalation_actions.rule_key`. The firing log
   keeps `stage_key` as plain text, so the audit of the removed stage survives.
7. **The ticket view reads the chain.** `availableStages` are the stages whose
   `reached_by` contains an event that the transition map allows from the
   current status; the fixed map `ESCALATION_REACHABLE_STAGES` is gone.
8. **The seed keeps today's chain** as the default of a new installation: the
   five stages with `review` (no predecessor), `work_order` ← `review`,
   `assignment` ← `work_order`, `acceptance` ← `assignment`,
   `acknowledgement` ← `acceptance` and their reaching events.

## Alternatives

- **Keep the five fixed keys and let rules carry the clock only.** Rejected: the
  office cannot add or remove a stage, which is exactly what it asked for.
- **Add a stage by adding a ticket status and a transition (WP-M14-35,
  WP-M14-38).** Kept as a prerequisite, not as the answer: those packages make
  the workflow configurable, they do not give the escalation stages their chain,
  their clock and their actions.
- **Re-point the clock of every rule instead of naming a predecessor per stage.**
  Rejected: the chain is the display order and the clock of the installation;
  encoding it in every rule duplicates one fact in many rows.
- **Cascade the predecessor itself (deleting a stage deletes its children).**
  Rejected: a removed step is normally spliced out, the following stage keeps
  waiting after the predecessor's predecessor; deleting the children would
  delete configuration the office did not ask for.
- **Allow several roots only implicitly (empty predecessor).** Kept: multiple
  stages without predecessor are valid — an installation may escalate from the
  report along more than one level.

## Consequences

- An installation can model its own escalation depth; the defaults of ADR-0008
  stay the seed, not the law.
- The stages stop being a copy of the workflow states: `reached_by` says how a
  stage is reached, the workflow stays the owner of the transitions.
- Removing a stage silently removes its rules and their actions; the
  administration names that effect and the firing log stays readable.
- The engine no longer knows the five keys: reached stages, the waiting gate and
  the reachable stages of the ticket view follow the rows.
- A rule of a removed stage cannot survive; a rule that should stay must be
  written without a stage or moved to another stage before the removal.
- The administration needs an add/remove flow for stages and the i18n texts that
  explain the predecessor and the cascade (WP-M14-65, WP-M14-66).
