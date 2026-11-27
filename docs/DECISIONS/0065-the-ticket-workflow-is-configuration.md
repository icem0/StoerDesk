# ADR-0065: The ticket workflow is configuration — status, stage, button and automation

- Status: proposed
- Date: 2026-11-27
- Stakeholders: office, manager, admin
- Supersedes (when accepted): ADR-0017 (the workflow milestones are the escalation
  stages), ADR-0023 (the stage chain), ADR-0041 (the workflow events set the status)
- Amends (when accepted): ADR-0026, ADR-0033, ADR-0057 (the `offer` and `assign`
  action become actions of buttons and automations alike), ADR-0064 (the timer
  leaf gains the start values `status_entered` and `stage_entered`)
- Specification: `specs/03-ticket-workflow.md`

## Context

A review of the interface on 2026-11-27 found that every workflow stage of the
ticket detail page is clickable whatever the ticket's state — a new ticket could
be set to „Quittiert“ directly. The cause is structural, not a missing `if`:

- the **status** is configuration (`ticket_statuses`, ADR-0025), but nine status
  keys are hard-coded in about 20 source files (workflow, dashboard, statistics,
  on-call coupling, customer routes, list, pauses, delete, the detail page);
- the **workflow events** set a fixed status in code (`WORKFLOW_EVENT_STATUS`,
  ADR-0041) and carry fixed side effects (accept, decline, acknowledge …);
- the **stages** are a chain of milestones reached by those events
  (`reached_by`, ADR-0017/0023); `readReachableStages()` offers every active
  stage without looking at the ticket (ADR-0041, decision 4);
- the **escalation rules** hang on the stages and can change the status
  (`status_change`), offer and assign.

Three overlapping notions (status, stage, event) and a fourth one (escalation)
describe one workflow, and none of them is the single place where the office
decides what may happen next. The office said: „ich will dass der Workflow
dynamisch eingerichtet werden kann … vielleicht ist sogar die Bezeichnung
Eskalation falsch … es soll so gut wie keine starren Vorgaben geben“; a ticket
ends „wenn wir per Aktion einbauen, dass es enden soll“. In the concept dialogue
of 2026-11-27 the office decided:

- stage and status have **nothing to do with each other** and both stay: the
  status is a coarse life cycle („Neu, In Arbeit, Erledigt“), the stage is the
  fine progress; a stage may carry nothing but a notification under a condition;
- which buttons a ticket shows is configurable — per status, per stage and under
  conditions;
- the area is called „Workflow“, its rules „Automationen“;
- installed tickets are converted to the small status set;
- the stages are a free list, not a chain;
- the workflow area opens at once on the workflow — today it opens on the
  deadline tab „Fristen“, which belongs to the settings, not to the workflow.

## Decision

1. **Four notions, one area.** The administration `/admin/escalation` becomes
   `/admin/workflow` („Workflow“) with four tabs: **Status**, **Stufen**,
   **Knöpfe**, **Automationen**. „Eskalation“ survives only as the everyday word
   for an automation that notifies; it is no longer a module name. The area
   opens directly on the tab **Knöpfe**; the tab is part of the path
   (`/admin/workflow/buttons`, `…/automations`, `…/stages`, `…/statuses`), so a
   reload and a bookmark keep it.
   - **The deadlines leave the workflow.** The total deadline per priority
     (ADR-0008, today the first tab „Fristen“ of `/admin/escalation`) is a setting
     of the timeline, not of the workflow: it gets its own entry „Fristen“ in the
     settings menu at `/admin/deadlines` (the route that redirects today). The
     API `GET/PUT /api/v1/settings/deadlines` is unchanged. The office: „die
     Fristen sollten separat in den Einstellungen einstellbar sein … hat nicht
     direkt was mit den Workflow-Einstellungen zu tun“. This step is independent
     of the rest and may land first.
2. **The status is the coarse life cycle.** `ticket_statuses` stays configurable
   (key, names, colour, position, active). Two flags carry all the meaning the
   code needs: `is_initial` (exactly one status; a new ticket gets it) and
   `is_terminal` (the ticket is finished). „Open“ means „not terminal“ (as
   planned in WP-M46-03/04). The seed is `NEW` „Neu“ (initial), `IN_PROGRESS`
   „In Arbeit“, `DONE` „Erledigt“ (terminal), `CANCELLED` „Storniert“
   (terminal). **No source file names a status key** outside the seed and the
   migration.
3. **The stage is the fine progress, independent of the status.** A stage is a
   row of a free list (key, names, colour, position, active); `position` only
   orders the display. A ticket carries at most one current stage
   (`tickets.stage_key`, nullable). A stage is set **only** by the action
   `set_stage`; `predecessor` and `reached_by` are removed. No status implies a
   stage and no stage implies a status.
4. **A button is a manual trigger.** A button (de „Knopf“) has a label (de/en),
   a position, one permission key of the existing catalogue (`ticket.review`,
   `ticket.accept`, …), a **visibility condition** (the condition tree of
   `specs/07-escalation.md` §7.4), optional **inputs** from a closed catalogue
   (note, work order, result, photos, target, reason — each required or
   optional) and an ordered list of **actions**. The detail page shows exactly
   the buttons whose permission the user holds and whose condition holds for
   that ticket and that user.
5. **An automation is a trigger without a person.** An automation has a trigger
   — **timer** (the scan of today's escalation job, the `timer_expired` leaf of
   ADR-0064) or **event** (`ticket_created`, `status_changed`, `stage_changed`,
   `button_pressed`) —, a condition and actions. Buttons and automations are
   rows of one table and are edited with one form; the tab only filters by the
   trigger kind.
6. **One action catalogue.** Buttons and automations share the actions
   `status_change`, `set_stage`, `set_reviewer`, `set_work_order`, `assign`,
   `offer`, `accept`, `decline`, `stop_timeline`, `resume_timeline`, `comment`
   (the former `history`), `notify`, `webhook` and `notify_reporter`. Every action
   keeps its own condition (§7.5 today). An action that needs a value takes it
   from the configuration or from an input of the button (`{ input: "target" }`).
   The side effects of the former events move into these actions:
   `accept` sets `accepted_at` and `first_response_at`, `stop_timeline` stops
   the bar (today: `acknowledged_at`), entering a terminal status sets
   `closed_at`, leaving it clears `closed_at`.
7. **The server re-checks every press.** `POST /api/v1/tickets/:ticketNo/buttons/:key`
   locks the ticket row (`SELECT … FOR UPDATE`), evaluates permission and
   visibility condition again with fresh facts and answers `409
button_not_available` when they no longer hold; it validates the inputs
   (`400` with the field), runs the mutating actions in that transaction and
   writes one `button_pressed` event plus the events of the actions. Notify,
   webhook and reporter messages go to the outbox after the commit. The lock
   restores the first-wins rule of the claim that ADR-0041 gave up — the second
   press sees the changed stage and gets `409`.
8. **The ticket ends only by an action.** A ticket is finished when an action
   `status_change` moves it into a terminal status — from a button
   („Abschließen“, „Stornieren“) or from an automation. Entering a terminal
   status also stops the timeline if it still runs; the timer scan skips
   terminal tickets. Nothing else ends a ticket; there is no hidden end state.
9. **No transition table returns.** The visibility condition of a button is the
   guard of a step; the office writes it with the fields `status`, `stage`,
   `priority`, `assigned`, `assignmentStatus`, `workOrderSet`, `paused`,
   `actorIsAssignee`, `actorIsOfferee`, `actorRole` and the rest of §7.4.
   `WORKFLOW_EVENT_STATUS` and `transitionTicket()` are replaced by the action
   executor.
10. **Automations fire once per occasion.** A timer automation keeps the
    firing log of §7.7 (unique per ticket, rule, threshold). The timer leaf
    gains the start values `status_entered` and `stage_entered`, so a ticket
    that re-enters a stage gets a new threshold and the automation may fire
    again for that visit. An event automation fires once per causing event
    (unique per ticket, rule and event id); an automation's own actions may
    cause further events up to a chain depth of 3, after which the executor
    stops and writes a `workflow_loop_stopped` note.
11. **Installed tickets are converted.** One migration maps the statuses
    (`NEW` → `NEW`; `IN_REVIEW`, `WORK_ORDER_CREATED`, `OFFERED`, `ASSIGNED`,
    `ACCEPTED`, `ACKNOWLEDGED` → `IN_PROGRESS`; `CLOSED` → `DONE`; `CANCELLED`
    → `CANCELLED`) and derives the stage from the former status (table in
    `specs/03-ticket-workflow.md` §3.9). Custom status rows of an installation
    stay as ordinary rows. The seed buttons and automations reproduce today's
    workflow, so the office sees the same steps — now only where they apply.
    The history keeps its old event rows unchanged.

## Alternatives

- **Fix the detail page only** (filter `availableStages` by the status). Rejected:
  the rule would be hard-coded again and the office asked for configuration.
- **Restore the transition table of ADR-0025.** Rejected (as in ADR-0041): a
  status-to-status matrix cannot say „only the assigned technician“ or „only
  with a work order“; the button condition can.
- **Replace the stages by the statuses** (statuses as the only state). Rejected by
  the office: a stage may exist only to notify under a condition, and the status
  must stay a small life cycle the customer understands.
- **Stages as a group of statuses.** Rejected: a second hierarchy that couples
  what the office wants apart.
- **Keep the stage chain with predecessors.** Rejected by the office: the order
  is display only; the waiting time is a timer since `stage_entered`.
- **Keep „Fristen“ as a tab of the workflow area.** Rejected by the office: the
  first click lands on a setting that has nothing to do with the workflow.
- **Keep the nine statuses for installed tickets.** Rejected by the office: two
  vocabularies would live on side by side.

## Consequences

- The office decides every step: which button, for whom, in which status and
  stage, with which inputs and effects; a wrong configuration can make a ticket
  stuck — the administration warns about a non-terminal status that no button
  and no automation can leave, and an admin can always use the action
  „Statuswechsel“ of the default button „Status setzen“ (permission
  `ticket.status.set`).
- The code loses every status key; dashboard, statistics, customer portal,
  on-call coupling, list filters, pauses and delete read the flags and the
  stages instead. The statistics phases (review, work order, accept, acknowledge)
  are computed from `stage_set` events of configured stages; how a phase maps to
  a stage is an open question of the specification.
- The `escalation` module, its tables and routes are renamed to `workflow`
  (`workflow_stages`, `workflow_rules` with `trigger_kind`, `workflow_actions`,
  `workflow_firings`); `/api/v1/escalation/*` answers `308` to the new paths
  for one release.
- Phase 45 (timer leaf) and phase 46 (draft save bar, „open“ = not terminal)
  land first; this decision builds on both and changes neither.
- The work is split into phase 47 (proposal in `specs/03-ticket-workflow.md`
  §3.12); the WP files are written when this ADR is accepted.
