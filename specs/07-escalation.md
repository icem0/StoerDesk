# 07 — Escalation

**Chapter:** 8 (escalation) with the rules of `PLAN.md` §9
**Scope:** ~190 lines
**Status:** reviewed for phase 13 (WP-M13-01), extended for phase 14 (WP-M14-58,
WP-M14-76), for the way of the escalation (WP-M17-00, ADR-0037) and for the
waiting clock as a condition (ADR-0064, phase 45)

The binding summary is `PLAN.md` §9. This slice defines the escalation stages, the
conditions under which a rule fires — the waiting clock of a rule is one of
them (ADR-0064) — and the actions a rule performs. The manual stage catalogue
of the former §7.5 is gone: the stages are the milestones of the ticket workflow.

## 7.1 The stages are the workflow milestones

A ticket walks through the stages of the chain. The default opens with the
stage of the arrival (`new`, `Neu` / `New`) followed by the milestones of the
workflow (`review`, `work_order`, `assignment`, `acceptance`,
`acknowledgement`); §7.11 makes the set itself configurable. The display names
are maintained in the administration.

| Key               | Stage                                    | Waiting state         | Reference of the clock |
| ----------------- | ---------------------------------------- | --------------------- | ---------------------- |
| `new`             | Neu / New                                | `NEW`                 | `received_at`          |
| `review`          | Prüfung / Review                         | `NEW`                 | `received_at`          |
| `work_order`      | Auftrag angelegt / Work order created    | `IN_REVIEW`           | `review_started`       |
| `assignment`      | Zuweisen oder Anbieten / Assign or offer | `WORK_ORDER_CREATED`  | `work_order_set`       |
| `acceptance`      | Angenommen / Accepted                    | `OFFERED`, `ASSIGNED` | `offered`, `assigned`  |
| `acknowledgement` | Quittiert / Acknowledged                 | `ACCEPTED`            | `accepted`             |

A stage is **reached** when the ticket enters the workflow state that follows
the milestone: `review_started`, `work_order_set`, `assigned`/`offered`,
`accepted` and `acknowledged`. The waiting state of a stage is the state the
ticket is in while it waits for that milestone. The first stage `new` is the
arrival of the ticket: the workflow never reaches it (an empty
`reached_by`), and it hands its clock down to `review`, so the stage behind
it still waits from the report.

Two rules belong to the same stage (`acceptance` waits for the acceptance of an
offer and of an assignment), because the two cases have different clocks and
different actions. A stage may therefore carry more than one rule.

The stages of the former manual catalogue (`office`, `group`, `assignee`,
`manager`) and the `level` of the former hard-coded rules are removed. They were a
second hierarchy next to the workflow, and every one of them has a workflow
counterpart.

## 7.2 The waiting clock

The waiting clock of a rule is a condition (ADR-0064): the leaf `timer_expired`
of §7.4 names the **start value** — one of the events the ticket already knows —
and the **delay** the ticket may wait, stored per priority. The clock starts at
the start value and runs until the milestone is reached. It stops with the
ticket: an open pause (`specs/05-timeline.md` §5.2) subtracts its overlapping
time from the elapsed time, exactly as the timeline does.

The seed of ADR-0008 is a `timer_expired` leaf in the condition of every
default rule — the start values are those of the former rule fields:

| Rule (stage)              | Start value (timer) | `low` | `normal` | `high` | `critical` |
| ------------------------- | ------------------- | ----- | -------- | ------ | ---------- |
| `new`                     | `received_at`       | 15    | 15       | 15     | 5          |
| `review`                  | `received_at`       | 15    | 15       | 15     | 5          |
| `work_order`              | `review_started`    | 30    | 30       | 30     | 30         |
| `assignment`              | `work_order_set`    | 30    | 30       | 30     | 30         |
| `acceptance` (offer)      | `offered`           | 20    | 20       | 20     | 10         |
| `acceptance` (assignment) | `assigned`          | 15    | 15       | 15     | 15         |
| `acknowledgement`         | `accepted`          | 60    | 60       | 60     | 60         |

The rule of the first stage `new` is due with the ticket itself (§7.11),
independent of its delay; the minutes of its row are the ADR-0008 default of
the arrival. A rule may also carry **no timer** — then it waits with zero delay
from the moment its stage waits (the reached predecessor, §7.11) and fires as
soon as its condition matches. Two default rules are not bound to a stage and
start their timer at the ticket deadline instead of an event:
`deadline_80_percent` and `deadline_exceeded` carry the percent variant of the
leaf — `{ percent: 80 }` and `{ percent: 100 }` of the timeline `received_at`
→ `deadline_at`. Their actions are configured like the actions of every other
rule.

## 7.3 Rules

A rule is the unit of configuration. It holds the stage (which milestone it
waits for), the condition (when the rule applies at all — the waiting clock is
a leaf of it, ADR-0064) and the actions (what happens when it fires).

| Field       | Meaning                                                                                              |
| ----------- | ---------------------------------------------------------------------------------------------------- |
| `key`       | the identity of the rule: the key of its stage and its number — `review#1` (§7.5)                    |
| `stageKey`  | the stage the rule belongs to; `null` for the deadline rules                                         |
| `condition` | the condition group of §7.4; empty means "always"; a `timer_expired` leaf in it is the waiting clock |
| `actions`   | the ordered actions of §7.5                                                                          |

A rule fires when its timer has expired **and** the rest of its condition
matches. A rule without a timer is due with the start of its wait (§7.11). The
rule of a stage that is already reached never fires again: the ticket has left
the waiting state. When the clock has passed its deadline **and** the
condition holds, the rule fires exactly once per ticket, rule and threshold
(§7.7): one `escalated` event and the actions of the rule.

## 7.4 Conditions

A condition is a typed tree. It never carries free text or an expression: the
fields and the operators are a closed list, so a condition is validatable and
testable.

```
{ "all": [ … ] }   { "any": [ … ] }   { "field": …, "operator": …, "value": … }
```

| Field                | Type                                                       | Operators                      |
| -------------------- | ---------------------------------------------------------- | ------------------------------ |
| `priority`           | `low`, `normal`, `high`, `critical`                        | `eq`, `ne`, `in`, `notIn`      |
| `status`             | ticket status                                              | `eq`, `ne`, `in`, `notIn`      |
| `source`             | `QR`, `INTERNAL`, `API`                                    | `eq`, `ne`, `in`, `notIn`      |
| `systemType`         | `BMA`, `LICHTRUF`, `RWA`, `EMA`, `SPRACHALARM`, `SONSTIGE` | `eq`, `ne`, `in`, `notIn`      |
| `objectExternalType` | string                                                     | `eq`, `ne`, `contains`         |
| `assigned`           | boolean                                                    | `eq`                           |
| `deadlinePercent`    | number 0–100                                               | `gt`, `gte`, `lt`, `lte`, `eq` |
| `elapsedMinutes`     | number                                                     | `gt`, `gte`, `lt`, `lte`, `eq` |
| `paused`             | boolean                                                    | `eq`                           |
| `stageReached`       | stage key                                                  | `eq`, `ne`, `in`, `notIn`      |
| `time_of_day`        | interval `HH:MM`–`HH:MM`, one or more                      | `in`, `notIn`                  |
| `shift`              | readiness pool (uuid)                                      | `eq`, `ne`                     |
| `timer_expired`      | `{ reference, minutes }` or `{ percent }`                  | `expired`, `notExpired`        |

A condition group holds at most two levels and at most 20 leaves. The evaluation
is a pure function in `packages/shared`, used by the API and by the administration
form alike.

`time_of_day` (WP-M14-41) matches the wall clock of `Europe/Berlin` — the
instance's display timezone — against one or more intervals of the day: the start
is included, the end excluded, so `06:00–22:00` and `22:00–06:00` partition the
day and an interval may cross midnight. Without a wall-clock fact the evaluator
reads the current time; an interval that names no clock time never matches.

`shift` (WP-M14-147, ADR-0030) names a readiness pool of the on-call calendar:
it matches when the pool has a staffed shift at the moment of the evaluation —
a `CONFIRMED`, a `SWAP_REQUESTED` or a `PLANNED` shift that covers now, the rule
of `specs/04-oncall.md` §4a.6. `eq` matches a staffed pool, `ne` an unstaffed
one, so a rule may also ask for the pool without a shift. The evaluation stays a
pure function: the facts of the ticket carry the pools that are staffed at that
moment.

`timer_expired` (ADR-0064) is the waiting clock as a condition. The value
`{ reference, minutes }` names a start value — one of `received_at`,
`review_started`, `work_order_set`, `offered`, `assigned`, `accepted` — and the
delay per priority (`low`, `normal`, `high`, `critical`); it matches with
`expired` when the minutes from that event to now — pauses excluded — have
reached the delay of the priority of the ticket. An anchor event that never
happened never matches with `expired`; `notExpired` matches until the timer
has expired. The variant `{ percent }` (0–100) anchors on the timeline: it
matches when the timeline of the ticket has reached that percentage of
`received_at` → `deadline_at` — the two deadline rules of §7.2 are timers of
80 % and 100 %. The facts carry the minutes from every event that has happened
(`sinceEvent`); the threshold of the firing log follows the timer (§7.7).

## 7.5 Actions

An action is what happens when a rule fires. Every action carries its own
condition, so one rule can notify the office always and the management only in
the night.

| Type            | Configuration                                                                                                                                                                                     | Effect                                                                                                                                                                                                                                                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `notify`        | `target` (one user, a readiness pool **or** the assignees of the ticket) **or** `channels` (a subset of the configured channels); optional `priority` (`min`, `low`, `default`, `high`, `urgent`) | with a target: one outbox row per addressee of the target and per channel the addressee selected for `ticket.escalated` (§11.4, ADR-0037); without a target: one outbox row per channel, delivered by the outbox worker with its retry and fallback chain                                                                                                           |
| `webhook`       | `endpointIds` (webhook endpoints of the administration)                                                                                                                                           | one delivery row per endpoint, sent with the HMAC signature and the backoff of the webhook worker                                                                                                                                                                                                                                                                   |
| `history`       | `text` (optional, 1–500 characters), no key in the administration                                                                                                                                 | one normal `comment` event in the ticket history with `{ text }` and `actor_kind = 'system'`; the server assigns the action key                                                                                                                                                                                                                                     |
| `status_change` | `toStatus` (the key of a row of `ticket_statuses`)                                                                                                                                                | the dispatcher sets the ticket status to that target directly (§7.13, ADR-0041); one append-only `escalation_note` event records the change with `{ rule, stage, from, to }`                                                                                                                                                                                        |
| `offer`         | `target` (a readiness pool, a user group or one technician, §7.14)                                                                                                                                | the dispatcher runs the `offered` step of `ticket_transitions`; a pool target names the on-call person of the pool in `offered_to_user_id` and sets the offer timeout, a group target notifies the whole group at once, a user target names that technician in `offered_to_user_id`; every technician of the target is notified (§7.14)                             |
| `assign`        | `target` (a readiness pool, a user group or one technician, §7.14), `acceptance` (boolean, _Annahme erforderlich_)                                                                                | the dispatcher runs the `assigned` step of `ticket_transitions` for the first member of the target, sets `assigned_user_id`, `assignment_status` (`offered` or `accepted`), `assigned_by_user_id` (NULL for the system) and the target of the assignment (`assignment_target_kind`, `assignment_target_id`); the technician is notified (§7.14, ADR-0039, ADR-0057) |

A `notify` action with a `target` replaces the channel broadcast of the action:
the selected user, the technicians who have a shift in the selected readiness
pool at this moment, or the assignees of the ticket receive the notification —
and the **way is their own**: every recipient gets one row per channel they
selected for `ticket.escalated` under `/settings/notifications` (§11.4,
ADR-0037). A recipient without a selection row receives the notification on
their own ntfy topic (ADR-0030, ADR-0033).
The members of the pool without a shift receive nothing — the readiness service
is the team that is on duty. A user without an ntfy account contributes
nothing. A ticket without an assignee has nobody to notify — the target
`assigned` reaches nobody. Without a target the action keeps the channel
broadcast of the
installation. The optional `priority` is the ntfy level of the notification and
overrides the ticket-based default (`critical` = `urgent`, otherwise `default`).

A `history` action writes a normal ticket comment, not an `escalation_note`; the
ticket history renders it like every other comment. The key of every action is
internal: the administration sends none and the server assigns one (§7.5).

The keys of the escalation form one taxonomy: a stage has a free key
(`review`), a rule the key of its stage and its number (`review#1`,
`acceptance#2`), an action the key of its rule and its number (`review#1#1`). A
rule without a stage belongs to the root `deadline` (`deadline#1`). The number of
a rule is its position inside its stage, the number of an action its position
inside its rule; the server writes both keys, and the administration only numbers
the rule and the action (`#1`, `#2`) — it never names them. The migration
`0045_escalation_rule_numbering.sql` gives an installed configuration the
numbered keys; the actions and the firing log follow the rename of their rule.

Only a `status_change` action may move the status of a ticket (WP-M14-40 … WP-M14-40c):
it sets the status directly (§7.13, ADR-0041), and an unknown target status answers
`400 invalid_status_key` on `PUT /api/v1/escalation/config` (WP-M14-40b). The
`offer` and the `assign` action distribute a ticket (§7.14, ADR-0026): they
perform a step of the same table and record the assignees. No action of a rule
ever changes the priority, the deadline or the work order of a ticket.

## 7.6 Data model

| Table                | Columns                                                                                                                                                                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `escalation_stages`  | `id`, `key` (unique), `names` (jsonb, one label per locale), `position`, `active`, `predecessor` (nullable, the key of a stage), `reached_by` (jsonb, the event keys that reach the stage)                                                |
| `escalation_rules`   | `id`, `key` (unique), `stage_key` (the key of a stage, nullable), `condition` (jsonb — the clock is the `timer_expired` leaf in it, ADR-0064), `position`, `active` — `reference`, `minutes` and `percent` are gone with migration `0070` |
| `escalation_actions` | `id`, `key` (unique per rule), `rule_key` (foreign key), `type`, `config` (jsonb), `condition` (jsonb), `position`, `active`                                                                                                              |
| `escalation_firings` | `id`, `ticket_id`, `rule_key`, `threshold_at`, `fired_at` — unique over `(ticket_id, rule_key, threshold_at)`                                                                                                                             |

The `key` is the identity of a stage, a rule and an action, not the UUID. The key
of a stage is free and stays editable while the stage is created. The key of a
rule and of an action is derived (§7.5): the server writes it, the administration
only numbers the rule and the action. The stages of an installation are seeded
once (the default chain of §7.12) and the rules are seeded from the former
settings values, so the deadlines of a running installation stay the same after
the migration.

## 7.7 Idempotency and the audit trail

A rule fires at most once per ticket, rule and threshold. The unique key of
`escalation_firings` carries that guarantee in the database, so a second scan of
the same minute cannot write a second event and cannot send a second webhook.
The threshold comes from the timers of the condition (ADR-0064): the start
value plus the delay of the priority of the ticket, the pauses inside added;
with several `expired` timer leaves the largest threshold wins. A rule without
a timer thresholds at the start of its wait (§7.11).

Every firing writes exactly one append-only `escalated` event with the payload
`{ rule, stage, thresholdAt, deadlineAt }` and performs the actions of the rule.
The `comment` event of a `history` action carries the configured text; the
`escalation_note` events of `status_change`, `offer` and `assign` stay separate.

The ticket history renders the firing with the **display name** of its stage —
the names the administration maintains for the stage (`escalation_stages.names`,
read with `GET /api/v1/escalation-stages` of §7.9). A raw stage key never enters
the history, and a stage that was removed shows as unknown. The firing of the
**first stage** (§7.11) is the arrival of the ticket: its audit row and its
actions stay, but the history shows no row for it — the report entry already
says that the ticket arrived (WP-M14-152).

## 7.8 The job

`apps/api/src/jobs/escalation.ts` keeps the queue `ticket-escalation` and the
schedule every minute. The scan reads the active rules, the candidate tickets and
their events, computes the threshold of every rule and fires the rules that are
due. The job logs counts and rule keys only, never ticket content, contact data or
user names (`PLAN.md` §15).

## 7.9 API

| Route                           | Permission       | Meaning                                                 |
| ------------------------------- | ---------------- | ------------------------------------------------------- |
| `GET /api/v1/escalation/config` | `settings.read`  | stages, rules and actions of the installation           |
| `PUT /api/v1/escalation/config` | `settings.write` | replaces the rules and their actions in one transaction |
| `PUT /api/v1/escalation/stages` | `settings.write` | replaces the whole stage set in one transaction (§7.12) |
| `GET /api/v1/escalation-stages` | `ticket.read`    | the five stages with their names for the ticket view    |

The staff read answers the stages of the ticket view; the administration edits the
configuration. A malformed body answers `400 invalid_request` with the field
paths.

The two writes of the configuration take one transaction-scoped advisory lock
before they read or write, so concurrent writes run one after the other and the
last one wins as a whole — never a `500` from two transactions that reinsert the
same rule keys (WP-M46-01).

## 7.10 The ticket view

The ticket detail carries the stages the ticket can still reach as buttons next
to each other: every reachable milestone stands there as a button, so the office
reaches it without opening a selection. A click performs the workflow transition
of that milestone (with its own form, e.g. the AA/SA number of the work order)
and marks the stage as reached. The form of the milestone stands below the
buttons, not above them. The actions that are no milestone (decline, claim,
e-mail, cancel, delete) stay buttons.

The server answers the reachable stages with the ticket (`availableStages`); the
workflow events themselves are fixed in code (`§7.13`, ADR-0041).

## 7.11 The stage chain is configurable (ADR-0023)

The set of stages is configuration, not code. `PUT /api/v1/escalation/stages`
replaces the whole set in one transaction: a row that is missing is deleted, a
key that was not used before is created. At most 20 stages exist at a time.

| Field         | Meaning                                                                                                  |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| `key`         | free stage key (`^[a-z][a-z0-9_]{0,39}$`), unique, the identity of the stage                             |
| `predecessor` | the key of the stage before this one, or `null` — the stage without predecessor waits from `received_at` |
| `reached_by`  | the workflow event keys that reach this stage; an empty array means the workflow never reaches it        |

The chain is validated by the pure function `validateEscalationStageChain` in
`packages/shared`: unique keys, a predecessor that exists and is not the stage
itself, no cycle, the position of a stage greater than the position of its
predecessor, and every `reached_by` entry being a workflow event key of the code map
map of `apps/api/src/tickets/workflow.ts`. A violation answers
`400 invalid_request` with the field paths and writes nothing.

The predecessor starts the wait: a rule of a stage **without a timer** waits
with zero delay from the moment its stage's predecessor was reached, which is
the latest event of that predecessor's `reached_by`, or from `received_at` when
the stage has no predecessor. A predecessor that the workflow never reaches —
an empty `reached_by` — hands its start down, so the stage behind it waits from
the same event. The helper `escalationStageClockEvents` in `packages/shared`
answers these events, and the engine and the contract of §7.11 take the start
of a rule without a timer from it. A rule **with** a `timer_expired` leaf names
its own start value in the condition — the former rule field `reference` is
gone (ADR-0064). The deadline rules keep their percent variant.

A rule of a stage fires while its stage is **not reached** — no event of its
`reached_by` in the events of the ticket — and its clock passed the deadline.
`stageReached` conditions and the `escalated` payload use the same derivation.

The stage without predecessor is the **first stage**: its rules are due with the
ticket itself, independent of their timer, and the creation
paths of the report form, the internal form and the external API evaluate them
right after the ticket transaction. The `condition` of such a rule still decides
whether it fires, and an open pause suppresses the firing until the pause ends.
A chain has **exactly one** stage without predecessor — the first stage.
A second one is rejected by the chain validation (`400 invalid_request` with the
path `stages.<i>.predecessor`), a new stage therefore always joins the chain and
the administration offers no predecessor for it.

The first stage is the anchor of the chain: `PUT /api/v1/escalation/stages`
rejects a body that omits it or gives it a predecessor (`400 invalid_request`),
and the administration hides its remove action and locks its predecessor select.
Only the first stage is protected: a stage without predecessor that an earlier
version wrote may be removed again.

`escalation_rules.stage_key` is a foreign key to `escalation_stages.key` with
`ON DELETE cascade`: removing a stage removes its rules and their actions. The
firing log keeps `stage_key` as plain text, so the audit of a removed stage
survives. The seed of a new installation is the chain of §7.1: `new` without
predecessor, `review` ← `new`, `work_order` ← `review`, `assignment` ←
`work_order`, `acceptance` ← `assignment`, `acknowledgement` ← `acceptance`.
The migration `0046_escalation_stage_new.sql` anchors an already installed
chain at the stage `new` the same way: the old first stage gets it as
predecessor, every stage moves one position behind and the rule `new#1` waits
`received_at` with the minutes of ADR-0008 — an empty chain (the fresh
installation takes the chain from the seed), a chain that already knows the
stage and a chain at the position limit stay untouched.

## 7.12 Boundaries

- The manual stage catalogue, the `escalation_set` event and
  `POST /api/v1/tickets/:ticketNo/escalate` are removed: the workflow already
  records who reached which milestone.
- Only a `status_change` action of a fired rule moves the status of a ticket
  (WP-M14-40 … WP-M14-40b): it sets the status directly (§7.13, ADR-0041). The
  `offer` and the `assign` action distribute a ticket (§7.14, ADR-0026) and
  therefore also perform a step of that table. No action changes the priority, the
  deadline or the work order of a ticket.
- Closed, cancelled, acknowledged and suspected-spam tickets never escalate.
- An open pause pauses the rule clock exactly as it pauses the timeline.
- The notifications of the first version are external systems only; there is no
  in-app escalation inbox.
- No fixed stage key survives: the CHECK `escalation_stages_key_check` of
  migration `0031` and the `z.enum(ESCALATION_STAGE_KEYS)` contract are gone
  (WP-M14-59, WP-M14-60); the shared list survives only as the seed default
  chain and the last use of it leaves the code with WP-M14-64.

## 7.13 The workflow events set the status (ADR-0041)

The ticket workflow has no transition table. Each workflow event (`review_started`,
`work_order_set`, `assigned`, `offered`, `claimed`, `accepted`, `declined`,
`acknowledged`, `closed`, `reopened`, `uncancelled`, `cancelled`) names one
target status in the code map `WORKFLOW_EVENT_STATUS` in
`apps/api/src/tickets/workflow.ts`. `transitionTicket()` writes that status, the
workflow columns (`review_started_at`, `accepted_at`, `acknowledged_at`,
`closed_at`, …) and one `ticket_events` row in one transaction. It does not check
the previous status: no event is refused because of the status the ticket has.
An unknown event key answers `400 invalid_event`.

The escalation stages decide **when** a status is set (§7.4 to §7.12). A stage of
the `status_change` action sets its `toStatus` directly and appends one
`escalation_note` event `{ rule, stage, from, to }`, so every change of status is
recorded in the history. The ticket view offers the active stages whose `reached_by`
events are workflow events (§7.10).

The statuses are configuration: the rows of `ticket_statuses` (§7.1) are created,
renamed and deactivated in the administration. The table `ticket_transitions`
of the earlier design (ADR-0025, migrations `0041`/`0042`) is removed by migration
`0053`; its administration page and its API are gone.

## 7.14 The offer and the assign action (ADR-0026, ADR-0033, ADR-0039, ADR-0057)

Two actions distribute a ticket. `offer` (ADR-0026) hands it to the on-call person
of a pool with the offer timeout chain; that behaviour is unchanged. `assign`
(ADR-0039, ADR-0057) gives the ticket to **one** technician, who answers the
assignment. The assignment is the same step in the escalation and in the ticket
view.

### The offer target (unchanged)

`offer` carries a `target`: `kind` `pool` (a row of `oncall_pools`) or `group`
(a row of `groups`), and its `id`. A pool target names the on-call person of the
pool in `offered_to_user_id` and sets the offer timeout
(`oncall.escalate_to_group_after_min`); a group target notifies the whole group at
once. A target without a technician changes nothing.

### The target of the assignment

The assignment names a **target of the installation** (ADR-0057): a readiness
pool (`kind: pool`, a row of `oncall_pools`), a user group (`kind: group`, a
row of `groups`) or one technician (`kind: user`). The shape is the target of
the `offer` action — the installation knows no third pool for the assignment.

The **members of the target** are the list of the assignment: the members of the
group of the pool or the members of the group itself, ordered by name
(`specs/04-oncall.md` §4a.5); a pool without a group has every active user with
the role `oncall`; a target of the kind `user` is that technician, if the
account is active. The **first** member of the list gets the ticket. The
installation stores no further order — the name order is the order of the
chain.

In the ticket view the workflow action _Zuweisen_ offers the same target: the
readiness pools, the user groups and the technicians of the installation. The
office chooses the target and states _Annahme erforderlich_ for this
assignment. The picker names the person who made the assignment: the actor of
the event is stored as `assigned_by_user_id`.

### The assign action

| Field        | Meaning                                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------------------------------- |
| `target`     | the target of the assignment: a readiness pool, a user group or one technician (ADR-0057)                        |
| `acceptance` | `true`: the status is `offered` and waits for the technician's answer; `false`: the status is `accepted` at once |

### The state of an assignment

The ticket carries the assignment in three columns (ADR-0039, decision 2):
`assigned_user_id` (the technician), `assignment_status` and
`assigned_by_user_id` (the user who made the assignment, NULL for the system).
It carries the **target** of the assignment in two more columns
(ADR-0057): `assignment_target_kind` (`pool`, `group` or `user`) and
`assignment_target_id`. The target is the list the refusal walks.

| From                     | Event                                 | To `assignment_status`  | Notification                                                                                                                |
| ------------------------ | ------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| none                     | `assign`, acceptance on               | `offered`               | the technician (`ticket.assigned`)                                                                                          |
| none                     | `assign`, acceptance off              | `accepted`              | the technician (`ticket.assigned`)                                                                                          |
| `offered`                | technician accepts (`accepted` step)  | `accepted`              | the assigner (`ticket.assignment_answered`)                                                                                 |
| `offered`                | technician declines (`declined` step) | `declined`              | the assigner (`ticket.assignment_answered`); the escalation offers the next member of the target (`offered`), if one exists |
| `declined` or `accepted` | `assign` again                        | `offered` or `accepted` | the new technician                                                                                                          |

Every change writes one `ticket_events` row of the step it performs, so the
history of the assignments stays in the event log; the columns hold only the
current state.

The event names are the workflow events of §7.13: `assigned`
for `assign`, `accepted` and `declined` for the answer. A ticket that has no
technician for the target keeps its status and the action writes nothing; the
status itself is never a condition (§7.13, ADR-0041).

### The notifications

- The **assigned technician** receives `ticket.assigned` on the channels they
  selected for that event type (`specs/10-notifications.md` §11.4). Only ntfy has
  an address per user today (§11.3); the other channels reach the office and are
  the business of the `notify` action.
- The **assigner** (`assigned_by_user_id`) receives `ticket.assignment_answered`
  when the technician accepts or declines. A rule-made assignment has no assigner
  and notifies nobody this way.
- The `notify` action (§7.5) with the target `assigned` reaches the assigned
  technician; with the target `assigner` it reaches the user who made the
  assignment. A ticket without an assignee or without an assigner reaches nobody.

### The retired model

`ticket_assignees` (§4.13 of `specs/02-data-model.md`, migration 0044) is no
longer written by the `assign` action. The `offer` action wrote no assignees
before, so it is unaffected. The table and its read in the ticket detail are
retired with the migration `0058` (WP-M19-08): the technician of the latest row
moves into `tickets.assigned_user_id`, and the ticket detail answers the one
`assignee` of the ticket instead of a list.

The **assignee pool** — the setting `escalation.assignee_pool` with its own
ordered list of technicians and its tab _Pool der Office_ in the administration
(ADR-0039, decision 3) — is retired with ADR-0057: the assignment names a
target of the installation (§7.14), and the readiness pools and the user groups
of the installation are the lists of the assignment. The setting is dropped
with the migration `0066`; the stored rules of the escalation that assigned
from the pool of the office lose that action — the office sets a target in the
administration.
