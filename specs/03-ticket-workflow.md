# 03 — Ticket workflow

**Chapter:** 5 + 5.x additions (the ticket workflow as configuration)
**Scope:** ~260 lines
**Status:** draft for review — ADR-0065 (proposed). Until ADR-0065 is accepted
and this slice is reviewed, `PLAN.md` §7 and `specs/07-escalation.md` stay
binding; nothing here is implemented.

The workflow of a ticket is configuration of the installation. The code knows
four notions and no names: the **status** (coarse life cycle), the **stage**
(fine progress), the **button** (a manual trigger) and the **automation** (a
trigger without a person). Buttons and automations run the same **actions**.
Nothing in the code says which status follows which, which stage exists or when
a ticket ends — the seed of §3.10 is the default of a new installation, not a law.

## 3.1 Terms

| Term (UI de / en)       | Meaning                                                                    | Stored in                                    |
| ----------------------- | -------------------------------------------------------------------------- | -------------------------------------------- |
| Status / Status         | the coarse life cycle the customer sees („Neu“, „In Arbeit“, „Erledigt“)   | `ticket_statuses`, `tickets.status`          |
| Stufe / Stage           | the fine progress the office works with („Prüfung“, „Angenommen“ …)        | `workflow_stages`, `tickets.stage_key`       |
| Knopf / Button          | a manual trigger on the ticket detail page                                 | `workflow_rules` (`trigger_kind = 'button'`) |
| Automation / Automation | a trigger by timer or event                                                | `workflow_rules` (`timer`, `event`)          |
| Aktion / Action         | one effect of a button or an automation                                    | `workflow_actions`                           |
| Bedingung / Condition   | the typed condition tree of `specs/07-escalation.md` §7.4, extended (§3.5) | jsonb on rules and actions                   |

Status and stage are independent: no status implies a stage, no stage implies a
status. „Eskalation“ is no module name any more; it is the everyday word for an
automation that notifies.

## 3.2 The status

A status row has `key` (`^[A-Z][A-Z0-9_]{1,31}$`, unchanged since `0040`),
`names` (de/en), `color`, `position`, `active` and two flags:

- `is_initial` — exactly one active status carries it; a new ticket (QR form,
  internal form, API) gets it. The administration refuses to remove the flag
  from the last initial status (`422 initial_status_required`).
- `is_terminal` — the ticket is finished. „Open“ everywhere (list filter,
  dashboard, customer portal, QR landing page, statistics) means „status not
  terminal“ (WP-M46-03/04).

Entering a terminal status sets `closed_at` and stops the timeline if it still
runs; leaving it clears `closed_at`. The timer scan skips terminal tickets. No
other column depends on a status key.

A status that is in use cannot be deleted, only deactivated (`409 status_in_use`,
unchanged); a deactivated status disappears from the pickers of buttons and
automations but keeps its tickets.

## 3.3 The stage

A stage row has `key` (`^[a-z][a-z0-9_]{1,31}$`), `names` (de/en), `color`,
`position` and `active`. The stages are a **free list**: `position` orders the
display of the stage on the detail page, in the list and in the timeline, nothing
else. There is no predecessor and no `reached_by`.

A ticket has at most one current stage, `tickets.stage_key` (nullable, foreign
key `ON DELETE SET NULL`). It changes **only** through the action `set_stage`
(§3.6), which writes one `stage_set` event `{ from, to }`. The history renders the
display name; a removed stage shows as unknown. `stage_set` events are the
markers of the timeline (`specs/05-timeline.md`): one marker per configured stage
the ticket entered, at the time of its first entry.

## 3.4 Buttons

A button is a `workflow_rules` row with `trigger_kind = 'button'` and the
trigger payload:

| Field         | Meaning                                                                         |
| ------------- | ------------------------------------------------------------------------------- |
| `labels`      | de/en, 1–40 characters                                                          |
| `style`       | `primary`, `secondary`, `danger` (the visual weight on the detail page)         |
| `permission`  | one key of the permission catalogue (`ticket.review`, `ticket.accept`, …)       |
| `condition`   | the visibility condition (§3.5); empty means always — also in a terminal status |
| `inputs`      | ordered list of inputs (below), at most 6                                       |
| `confirmText` | optional de/en text of a confirmation dialog                                    |

The inputs come from a closed catalogue; each carries `required` (boolean):

| Input        | Asks for                                                           | Validation                         |
| ------------ | ------------------------------------------------------------------ | ---------------------------------- |
| `note`       | a text                                                             | 1–2000 chars; `minLength` optional |
| `reason`     | a text that the history shows as reason                            | at least 5 characters (§7 rule 6)  |
| `work_order` | AA/SA type and number                                              | the existing work-order validation |
| `result`     | `fixed`, `partially_fixed`, `follow_up_required`, `no_fault_found` | one of the list                    |
| `photos`     | photos                                                             | the existing upload limits         |
| `target`     | a readiness pool, a user group or one technician (§7.14)           | an existing active target          |

**Which buttons a ticket shows:** the detail response carries `buttons` — every
active button whose permission the user holds and whose condition holds for the
ticket and the user right now, ordered by `position`. It replaces
`availableStages` and the hard-coded `menuEntries` of the detail page.

**Pressing a button:** `POST /api/v1/tickets/:ticketNo/buttons/:key` with
`{ inputs }`. In one transaction the server

1. locks the ticket row (`SELECT … FOR UPDATE`);
2. checks the permission (`403`) and evaluates the condition with fresh facts —
   `409 button_not_available` when it no longer holds;
3. validates the inputs — `400` with `field` and `code`;
4. writes one `button_pressed` event `{ button, inputs }` (photos and contact
   data by reference only) and runs the mutating actions in order, each guarded
   by its own condition;
5. commits; afterwards the non-mutating actions (`notify`, `webhook`,
   `notify_reporter`) enqueue their outbox rows and the event automations of
   §3.7 run.

A failed mutating action rolls the whole press back and answers its code. Two
people pressing „Annehmen“ at once: the second request waits for the lock, sees
the changed stage and gets `409` — the first-wins rule of the claim (`PLAN.md`
§12) holds again.

## 3.5 Conditions

The condition tree of `specs/07-escalation.md` §7.4 is reused unchanged in shape
(at most two levels, at most 20 leaves, pure evaluation in `packages/shared`).
New or changed leaves:

| Field              | Type                                                                                    | Operators                 |
| ------------------ | --------------------------------------------------------------------------------------- | ------------------------- |
| `status`           | status key                                                                              | `eq`, `ne`, `in`, `notIn` |
| `statusTerminal`   | boolean                                                                                 | `eq`                      |
| `stage`            | stage key or `none`                                                                     | `eq`, `ne`, `in`, `notIn` |
| `stageVisited`     | stage key (ever entered)                                                                | `eq`, `ne`, `in`, `notIn` |
| `assignmentStatus` | `none`, `offered`, `accepted`, `declined`                                               | `eq`, `ne`, `in`, `notIn` |
| `workOrderSet`     | boolean                                                                                 | `eq`                      |
| `actorIsAssignee`  | boolean (buttons only)                                                                  | `eq`                      |
| `actorIsOfferee`   | boolean (buttons only)                                                                  | `eq`                      |
| `actorRole`        | role key (buttons only)                                                                 | `eq`, `ne`, `in`, `notIn` |
| `timer_expired`    | as ADR-0064, start values extended by `status_entered`, `stage_entered`, `button:<key>` | `expired`, `notExpired`   |

`stageReached` is replaced by `stageVisited`. The `actor*` leaves exist only in
the condition of a button and of the actions of a button; the administration
refuses them in an automation (`400 actor_field_in_automation`).

## 3.6 Actions

One catalogue for buttons and automations. Every action keeps its own optional
condition. A value may be configured or taken from an input of the button
(`{ "input": "target" }`); an automation has no inputs.

| Action            | Configuration                             | Effect                                                                                                 |
| ----------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `status_change`   | `toStatus`                                | sets the status; `status_changed` event `{ from, to }`; terminal rules of §3.2                         |
| `set_stage`       | `toStage` or `none`                       | sets `stage_key`; `stage_set` event                                                                    |
| `set_reviewer`    | —                                         | `reviewed_by_user_id` = actor, `review_started_at` = now (buttons only)                                |
| `set_work_order`  | input `work_order`                        | writes type and number; `work_order_set` event                                                         |
| `assign`          | `target`, `acceptance`                    | §7.14 of `specs/07-escalation.md`, unchanged in effect                                                 |
| `offer`           | `target`                                  | §7.14, unchanged in effect                                                                             |
| `accept`          | —                                         | `assignment_status = accepted`, `accepted_at`, `first_response_at` (first time only); `accepted` event |
| `decline`         | input `reason`                            | the refusal chain of ADR-0057; `declined` event with the reason                                        |
| `stop_timeline`   | optional input `note`, `result`, `photos` | stops the bar (`timeline_stopped_at`, today `acknowledged_at`); `acknowledged` event with note/result  |
| `resume_timeline` | —                                         | clears the stop; `timeline_resumed` event                                                              |
| `comment`         | `text` or input `note`; `internal`        | a `comment` / `internal_commented` event (former `history`)                                            |
| `notify`          | as §7.5                                   | as §7.5                                                                                                |
| `webhook`         | as §7.5                                   | as §7.5                                                                                                |
| `notify_reporter` | as ADR-0056                               | as ADR-0056                                                                                            |

No action changes the priority or the deadline of a ticket. Pauses keep their
own controls (`specs/05-timeline.md` §5.2); deleting a cancelled ticket stays an
admin function outside the workflow, allowed for terminal tickets only.

## 3.7 Automations

An automation is a `workflow_rules` row with `trigger_kind` `timer` or `event`.

- **Timer:** the scan of `specs/07-escalation.md` §7.8 (job renamed
  `ticket-workflow-timer`). The automation is due when its condition holds,
  including at least one `timer_expired` leaf (required for this kind). Firing
  log `workflow_firings`, unique `(ticket_id, rule_key, threshold_at)`; the
  threshold is computed as in ADR-0064. Because `status_entered` and
  `stage_entered` move with every entry, a ticket that enters a stage again gets
  a new threshold and the automation may fire again for that visit.
- **Event:** `ticket_created`, `status_changed`, `stage_changed`,
  `button_pressed` (optionally one button key). The automation runs after the
  commit of the causing change, in its own transaction, if its condition holds.
  Unique `(ticket_id, rule_key, cause_event_id)` in the firing log.
- **Chains:** actions of an automation may cause further events. The depth is
  limited to 3; the fourth level is not run and one `workflow_loop_stopped`
  note names the automation. The administration warns when an event automation
  changes the very field its own trigger listens to.

Every firing writes one `automation_fired` event `{ rule, thresholdAt?, cause? }`
(the former `escalated`; old rows keep their type and their rendering).

## 3.8 How a ticket ends

A ticket ends only when an action `status_change` moves it into a terminal
status — from a button („Abschließen“, „Stornieren“) or from an automation
(e.g. „30 Tage nach Quittierung → Erledigt“). There is no implicit end: neither
a stage nor `stop_timeline` finishes a ticket. A terminal ticket shows only the
buttons whose condition admits a terminal status (the seed: „Wiedereröffnen“).

## 3.9 Migration of an installed system

One migration (number at implementation time) in one transaction:

| Former status        | New status    | New stage                                      |
| -------------------- | ------------- | ---------------------------------------------- |
| `NEW`                | `NEW`         | none                                           |
| `IN_REVIEW`          | `IN_PROGRESS` | `review`                                       |
| `WORK_ORDER_CREATED` | `IN_PROGRESS` | `work_order`                                   |
| `OFFERED`            | `IN_PROGRESS` | `offered`                                      |
| `ASSIGNED`           | `IN_PROGRESS` | `assigned`                                     |
| `ACCEPTED`           | `IN_PROGRESS` | `accepted`                                     |
| `ACKNOWLEDGED`       | `IN_PROGRESS` | `acknowledged`                                 |
| `CLOSED`             | `DONE`        | `acknowledged` if `acknowledged_at`, else none |
| `CANCELLED`          | `CANCELLED`   | as for `CLOSED`                                |

Custom status rows stay as ordinary rows without flags (`is_terminal` keeps its
value). The tables `escalation_stages`, `escalation_rules`,
`escalation_actions`, `escalation_firings` become `workflow_stages`,
`workflow_rules` (+ `trigger_kind`, `trigger` jsonb), `workflow_actions`,
`workflow_firings`; `predecessor` and `reached_by` fall. A former stage rule
becomes a timer automation whose condition is `stage in <the waiting stages of
its former stage>` plus its timer; the former stage keys map onto the new seed
stages (`review` waits in stage none, `work_order` in `review`, `assignment` in
`work_order`, `acceptance` in `offered`/`assigned`, `acknowledgement` in
`accepted`). The seed buttons of §3.10 are inserted if the installation has no
button yet. No `ticket_events` row is touched.

## 3.10 The seed (default workflow)

Stages: `review` „Prüfung“, `work_order` „Auftrag angelegt“, `offered`
„Angeboten“, `assigned` „Zugewiesen“, `accepted` „Angenommen“, `acknowledged`
„Quittiert“.

| Button (de)       | Permission           | Condition                                                               | Inputs                       | Actions                                                         |
| ----------------- | -------------------- | ----------------------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------- |
| Prüfung starten   | `ticket.review`      | status `NEW`                                                            | —                            | `set_reviewer`, `status_change IN_PROGRESS`, `set_stage review` |
| Auftrag eintragen | `ticket.review`      | stage `review`                                                          | `work_order`*                | `set_work_order`, `set_stage work_order`                        |
| Zuweisen          | `ticket.assign`      | stage `work_order`                                                      | `target`*                    | `assign`, `set_stage assigned`                                  |
| Anbieten          | `ticket.offer`       | stage `work_order`                                                      | `target`*                    | `offer`, `set_stage offered`                                    |
| Annehmen          | `ticket.accept`      | stage in (`offered`,`assigned`) and (actorIsAssignee or actorIsOfferee) | —                            | `accept`, `set_stage accepted`                                  |
| Ablehnen          | `ticket.decline`     | same as „Annehmen“                                                      | `reason`*                    | `decline`, `set_stage work_order`                               |
| Quittieren        | `ticket.acknowledge` | stage `accepted` and actorIsAssignee                                    | `note`_, `result`_, `photos` | `stop_timeline`, `set_stage acknowledged`                       |
| Abschließen       | `ticket.close`       | stage `acknowledged` and statusTerminal false                           | —                            | `status_change DONE`                                            |
| Wiedereröffnen    | `ticket.reopen`      | statusTerminal true                                                     | `reason`*                    | `status_change NEW`, `set_stage none`, `resume_timeline`        |
| Stornieren        | `ticket.cancel`      | statusTerminal false                                                    | `reason`*                    | `status_change CANCELLED`                                       |
| Status setzen     | `ticket.status.set`  | always (admin only by default)                                          | —, target status picked      | `status_change` to the picked status                            |

(* = required.) `ticket.status.set` is a new permission of the catalogue, granted
to the role `admin` only by the seed. The timer automations are the rules of ADR-0008/ADR-0064 with the
stage conditions of §3.9; the deadline automations keep `{ percent: 80 }` and
`{ percent: 100 }`.

## 3.11 Administration

`/admin/workflow` („Workflow“ in the settings menu, replacing „Eskalation“)
opens **directly** on the tab „Knöpfe“; the tab is part of the path
(`/admin/workflow/buttons|automations|stages|statuses`). `/admin/escalation`
and `/admin/statuses` redirect. Buttons and automations share one form
(trigger, condition builder, inputs for buttons, actions) and the draft save
bar of WP-M46-01. The page warns about:

- a non-terminal active status that no button and no automation can leave;
- a stage that no `set_stage` action names;
- an automation whose event trigger is changed by its own action.

**The deadlines are not part of the workflow.** The total deadline per priority
(ADR-0008) moves out of the former tab „Fristen“ to its own settings entry
„Fristen“ at `/admin/deadlines` (today a redirect). The API
`/api/v1/settings/deadlines` is unchanged.

## 3.12 Proposed split (phase 47, after phases 45 and 46)

Profile `ctx-256k` for every package. The WP files are written by WP-M47-00 once
ADR-0065 is accepted; this list is the proposal, not the backlog.

| WP        | Content                                                                                                                                                                                  |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WP-M47-00 | docs: accept ADR-0065, review this slice, rewrite `PLAN.md` §6/§7/§9 and `specs/07-escalation.md` §7.1/§7.11/§7.13, write the WP files                                                   |
| WP-M47-01 | the deadlines get their own settings page `/admin/deadlines`; the escalation page opens on its stage tab — independent quick win, UI + i18n + tests                                      |
| WP-M47-02 | shared contract: statuses with `is_initial`, stages without chain, `workflow_rules` with trigger kinds, button inputs, the action catalogue, the new condition leaves, evaluator + tests |
| WP-M47-03 | migration and seed: table rename, `tickets.stage_key`, status/stage mapping of §3.9, rule conversion, seed buttons/automations, migration tests                                          |
| WP-M47-04 | the action executor and the button route: lock, re-check, inputs, mutating actions, events, outbox after commit; `transitionTicket()` and `WORKFLOW_EVENT_STATUS` go                     |
| WP-M47-05 | automations: event triggers after commit with depth limit, timer scan with `status_entered`/`stage_entered`, firing log                                                                  |
| WP-M47-06 | no status key in code: dashboard, statistics, list, customer portal, QR landing, on-call coupling, pauses, delete read flags and stages                                                  |
| WP-M47-07 | ticket detail page: `buttons` from the API, input dialog, current stage, timeline markers from `stage_set`                                                                               |
| WP-M47-08 | administration `/admin/workflow`: tabs, button/automation form, stage and status tabs, warnings, redirects, help texts de/en                                                             |
| WP-M47-09 | exit: e2e of the seed workflow (report → close), a custom workflow without stages, the `409` of a stale button, docs and REPO-MAP                                                        |

## 3.13 Open questions

- Open question: which configured stage marks each statistics phase (review,
  work order, accept, acknowledge) — a mapping in the statistics settings or a
  flag on the stage?
- Open question: may a technician see buttons on the mobile view only in a
  reduced set (e.g. `style` or a flag „mobil“)?
- Open question: does the public status page show the status name only, or also
  the stage when the office marks the stage as „öffentlich“?
