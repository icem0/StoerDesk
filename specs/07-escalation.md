# 07 — Escalation

**Chapter:** 8 (escalation) with the rules of `PLAN.md` §9
**Scope:** ~190 lines
**Status:** reviewed for phase 13 (WP-M13-01), extended for phase 14 (WP-M14-58,
WP-M14-76)

The binding summary is `PLAN.md` §9. This slice defines the escalation stages, the
waiting deadlines of the stages, the conditions under which a rule fires and the
actions a rule performs. The manual stage catalogue of the former §7.5 is gone: the
stages are the milestones of the ticket workflow.

## 7.1 The stages are the workflow milestones

A ticket walks through the stages of the chain. The default opens with the
stage of the arrival (`new`, `Neu` / `New`) followed by the milestones of the
workflow (`review`, `work_order`, `assignment`, `acceptance`,
`acknowledgement`); §7.11 makes the set itself configurable. The display names
are maintained in the administration.

| Key | Stage | Waiting state | Reference of the clock |
| --- | --- | --- | --- |
| `new` | Neu / New | `NEW` | `received_at` |
| `review` | Prüfung / Review | `NEW` | `received_at` |
| `work_order` | Auftrag angelegt / Work order created | `IN_REVIEW` | `review_started` |
| `assignment` | Zuweisen oder Anbieten / Assign or offer | `WORK_ORDER_CREATED` | `work_order_set` |
| `acceptance` | Angenommen / Accepted | `OFFERED`, `ASSIGNED` | `offered`, `assigned` |
| `acknowledgement` | Quittiert / Acknowledged | `ACCEPTED` | `accepted` |

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

The clock of a stage starts at its reference event and runs until the milestone is
reached. It stops with the ticket: an open pause (`specs/05-timeline.md` §5.2)
subtracts its overlapping time from the elapsed time, exactly as the timeline does.

The deadline of a stage is the number of minutes the ticket may wait for the
milestone. It is stored per priority, so a critical ticket waits less than a low
one. The defaults of ADR-0008 are the seed of the configuration:

| Rule (stage) | Reference | `low` | `normal` | `high` | `critical` |
| --- | --- | --- | --- | --- | --- |
| `new` | `received_at` | 15 | 15 | 15 | 5 |
| `review` | `received_at` | 15 | 15 | 15 | 5 |
| `work_order` | `review_started` | 30 | 30 | 30 | 30 |
| `assignment` | `work_order_set` | 30 | 30 | 30 | 30 |
| `acceptance` (offer) | `offered` | 20 | 20 | 20 | 10 |
| `acceptance` (assignment) | `assigned` | 15 | 15 | 15 | 15 |
| `acknowledgement` | `accepted` | 60 | 60 | 60 | 60 |

The rule of the first stage `new` is due with the ticket itself (§7.11),
independent of its minutes; the minutes of its row are the ADR-0008 default of
the arrival. Two rules are not bound to a stage and use the ticket deadline
instead of a waiting clock: `deadline_80_percent` (80 % of the timeline) and
`deadline_exceeded` (100 % of the timeline). Their actions are configured like
the actions of every other rule.

## 7.3 Rules

A rule is the unit of configuration. It holds the trigger (which clock and which
minutes), the condition (when the rule applies at all) and the actions (what
happens when it fires).

| Field | Meaning |
| --- | --- |
| `key` | the identity of the rule: the key of its stage and its number — `review#1` (§7.5) |
| `stageKey` | the stage the rule belongs to; `null` for the deadline rules |
| `reference` | the event that starts the clock (`received_at`, `review_started`, `work_order_set`, `offered`, `assigned`, `accepted`) |
| `minutes` | the deadline per priority (`low`, `normal`, `high`, `critical`) |
| `percent` | the deadline rule only: the percentage of the timeline |
| `condition` | the condition group of §7.4; empty means "always" |
| `actions` | the ordered actions of §7.5 |

A rule fires when its clock has passed its deadline **and** its condition matches.
The rule of a stage that is already reached never fires again: the ticket has left
the waiting state.

## 7.4 Conditions

A condition is a typed tree. It never carries free text or an expression: the
fields and the operators are a closed list, so a condition is validatable and
testable.

```
{ "all": [ … ] }   { "any": [ … ] }   { "field": …, "operator": …, "value": … }
```

| Field | Type | Operators |
| --- | --- | --- |
| `priority` | `low`, `normal`, `high`, `critical` | `eq`, `ne`, `in`, `notIn` |
| `status` | ticket status | `eq`, `ne`, `in`, `notIn` |
| `source` | `QR`, `INTERNAL`, `API` | `eq`, `ne`, `in`, `notIn` |
| `systemType` | `BMA`, `LICHTRUF`, `RWA`, `EMA`, `SPRACHALARM`, `SONSTIGE` | `eq`, `ne`, `in`, `notIn` |
| `objectExternalType` | string | `eq`, `ne`, `contains` |
| `assigned` | boolean | `eq` |
| `deadlinePercent` | number 0–100 | `gt`, `gte`, `lt`, `lte`, `eq` |
| `elapsedMinutes` | number | `gt`, `gte`, `lt`, `lte`, `eq` |
| `paused` | boolean | `eq` |
| `stageReached` | stage key | `eq`, `ne`, `in`, `notIn` |
| `time_of_day` | interval `HH:MM`–`HH:MM`, one or more | `in`, `notIn` |
| `shift` | readiness pool (uuid) | `eq`, `ne` |

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

## 7.5 Actions

An action is what happens when a rule fires. Every action carries its own
condition, so one rule can notify the office always and the management only in
the night.

| Type | Configuration | Effect |
| --- | --- | --- |
| `notify` | `target` (one user, a readiness pool **or** the assignees of the ticket) **or** `channels` (a subset of the configured channels); optional `priority` (`min`, `low`, `default`, `high`, `urgent`) | with a target: one outbox row per addressee of the target on their own ntfy topic, with the selected ntfy priority; without a target: one outbox row per channel, delivered by the outbox worker with its retry and fallback chain |
| `webhook` | `endpointIds` (webhook endpoints of the administration) | one delivery row per endpoint, sent with the HMAC signature and the backoff of the webhook worker |
| `history` | `text` (optional, 1–500 characters), no key in the administration | one normal `comment` event in the ticket history with `{ text }` and `actor_kind = 'system'`; the server assigns the action key |
| `status_change` | `toStatus` (the key of a row of `ticket_statuses`) | the dispatcher runs the step of `ticket_transitions` (§7.13) that leads from the current status of the ticket to that target through `transitionTicket()`; one append-only `escalation_note` event records the change with `{ rule, stage, from, to }` |
| `offer` | `target` (a readiness pool, a user group or one technician, §7.14) | the dispatcher runs the `offered` step of `ticket_transitions`; a pool target names the on-call person of the pool in `offered_to_user_id` and sets the offer timeout, a group target notifies the whole group at once, a user target names that technician in `offered_to_user_id`; every technician of the target is notified (§7.14) |
| `assign` | `target` (a readiness pool, a user group or one technician, §7.14) | the dispatcher runs the `assigned` step of `ticket_transitions`; every technician of the target becomes an assignee of the ticket (`ticket_assignees`) and is notified (§7.14) |

A `notify` action with a `target` replaces the channel broadcast of the action:
the selected user, the technicians who have a shift in the selected readiness
pool at this moment, or the assignees of the ticket receive the notification on
the own ntfy topic (ADR-0030, ADR-0033).
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
it performs a step of the configurable transition table, so the workflow columns
stay keyed by the `event_key` of that step and an unknown target status answers
`400 invalid_status_key` on `PUT /api/v1/escalation/config` (WP-M14-40b). The
`offer` and the `assign` action distribute a ticket (§7.14, ADR-0026): they
perform a step of the same table and record the assignees. No action of a rule
ever changes the priority, the deadline or the work order of a ticket.

## 7.6 Data model

| Table | Columns |
| --- | --- |
| `escalation_stages` | `id`, `key` (unique), `names` (jsonb, one label per locale), `position`, `active`, `predecessor` (nullable, the key of a stage), `reached_by` (jsonb, the event keys that reach the stage) |
| `escalation_rules` | `id`, `key` (unique), `stage_key` (the key of a stage, nullable), `reference`, `minutes` (jsonb, per priority), `percent` (nullable), `condition` (jsonb), `position`, `active` |
| `escalation_actions` | `id`, `key` (unique per rule), `rule_key` (foreign key), `type`, `config` (jsonb), `condition` (jsonb), `position`, `active` |
| `escalation_firings` | `id`, `ticket_id`, `rule_key`, `threshold_at`, `fired_at` — unique over `(ticket_id, rule_key, threshold_at)` |

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

Every firing writes exactly one append-only `escalated` event with the payload
`{ rule, stage, thresholdAt, deadlineAt }` and performs the actions of the rule.
The `comment` event of a `history` action carries the configured text; the
`escalation_note` events of `status_change`, `offer` and `assign` stay separate.

## 7.8 The job

`apps/api/src/jobs/escalation.ts` keeps the queue `ticket-escalation` and the
schedule every minute. The scan reads the active rules, the candidate tickets and
their events, computes the threshold of every rule and fires the rules that are
due. The job logs counts and rule keys only, never ticket content, contact data or
user names (`PLAN.md` §15).

## 7.9 API

| Route | Permission | Meaning |
| --- | --- | --- |
| `GET /api/v1/escalation/config` | `settings.read` | stages, rules and actions of the installation |
| `PUT /api/v1/escalation/config` | `settings.write` | replaces the rules and their actions in one transaction |
| `PUT /api/v1/escalation/stages` | `settings.write` | replaces the whole stage set in one transaction (§7.12) |
| `GET /api/v1/escalation-stages` | `ticket.read` | the five stages with their names for the ticket view |

The staff read answers the stages of the ticket view; the administration edits the
configuration. A malformed body answers `400 invalid_request` with the field
paths.

## 7.10 The ticket view

The ticket detail carries one control for the stages: a selection of the stages
the ticket can still reach. Choosing a stage performs the workflow transition of
that milestone (with its own form, e.g. the AA/SA number of the work order) and
marks the stage as reached. The separate buttons of the workflow steps are gone —
the selection replaces them. The actions that are no milestone (decline, claim,
e-mail, cancel, delete) stay buttons.

The server answers the reachable stages with the ticket (`availableStages`); the
workflow transitions themselves are the rows of the `ticket_transitions` table
(`§7.13`, ADR-0025, WP-M14-38).

## 7.11 The stage chain is configurable (ADR-0023)

The set of stages is configuration, not code. `PUT /api/v1/escalation/stages`
replaces the whole set in one transaction: a row that is missing is deleted, a
key that was not used before is created. At most 20 stages exist at a time.

| Field | Meaning |
| --- | --- |
| `key` | free stage key (`^[a-z][a-z0-9_]{0,39}$`), unique, the identity of the stage |
| `predecessor` | the key of the stage before this one, or `null` — the stage without predecessor waits from `received_at` |
| `reached_by` | the transition event keys that reach this stage; an empty array means the workflow never reaches it |

The chain is validated by the pure function `validateEscalationStageChain` in
`packages/shared`: unique keys, a predecessor that exists and is not the stage
itself, no cycle, the position of a stage greater than the position of its
predecessor, and every `reached_by` entry being an event key of the transition
map of `apps/api/src/tickets/workflow.ts`. A violation answers
`400 invalid_request` with the field paths and writes nothing.

The predecessor carries the clock: a rule of a stage waits from the moment its
stage's predecessor was reached, which is the latest event of that predecessor's
`reached_by`, or from `received_at` when the stage has no predecessor. A
predecessor that the workflow never reaches — an empty `reached_by` — hands its
own clock down, so the stage behind it waits from the same clock. The helper
`escalationStageClockEvents` in `packages/shared` answers these events, and the
engine, the configuration service and the contract of §7.11 take the clock from
it. The explicit `reference` of such a rule must match that clock; `null` means
"take the clock of the stage". The deadline rules keep their percentage clock.

A rule of a stage fires while its stage is **not reached** — no event of its
`reached_by` in the events of the ticket — and its clock passed the deadline.
`stageReached` conditions and the `escalated` payload use the same derivation.

The stage without predecessor is the **first stage**: its rules are due with the
ticket itself, independent of their `reference` and `minutes`, and the creation
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
  (WP-M14-40 … WP-M14-40b): it performs a step of the `ticket_transitions` table
  (§7.13), so the workflow columns stay keyed by the `event_key` of that step. The
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

## 7.13 The ticket transitions are configuration (ADR-0025)

WP-M14-35 made the **statuses** rows of `ticket_statuses`; the steps between them
were still the code map `TRANSITIONS` in `apps/api/src/tickets/workflow.ts`
(`PLAN.md` §7). A status the administrator adds could never be entered or left.
`ticket_transitions` (migration `0041`) carries the steps as rows:

| Field | Meaning |
| --- | --- |
| `from_status` | foreign key to `ticket_statuses.key`, `ON DELETE cascade` — a removed status removes its steps |
| `to_status` | foreign key to `ticket_statuses.key`, `ON DELETE cascade` |
| `event_key` | the event that performs the step (`review_started`, `closed`, …); unique over `(from_status, event_key)` |
| `condition_json` | nullable jsonb, the condition of the step — stored from `0041`, evaluated only from WP-M14-41 |
| `active` | an inactive row never changes a ticket |

`transitionTicket()` resolves the row of `(current status, event)`; an unknown or
inactive combination answers `409 invalid_transition`. The workflow columns
(`review_started_at`, `accepted_at`, `acknowledged_at`, `closed_at`, …) stay keyed
by `event_key`: the row decides the new status, the event decides the timestamp.
The wildcard row `'*'` of the old map becomes one `cancelled` row per status — the
foreign key forbids a `*` key and a Postgres unique index would let duplicate
NULL rows through.

The migration seeds the `PLAN.md` §7 workflow (22 rows), so the workflow of an
installed instance never changes; `PUT`/`POST` of the transition administration
(WP-M14-39) edits rows. The nine statuses the foreign keys need are seeded
idempotently in the same migration and `apps/api/src/db/seed/statuses.ts` stays
the bootstrap of the API start. The old `tickets_status_check` of migration `0004`
is dropped in `0041`: the rows of `ticket_statuses` and their key-format CHECK
(`0040`) are the status configuration, and a status a ticket still carries must
survive a deactivation.

## 7.14 The offer and the assign action (ADR-0026, ADR-0033)

The office asked for two more actions of a rule: a ticket that waits too long for
a technician shall be **offered** to a pool of technicians, and a ticket shall be
**assigned** to technicians. Both actions distribute the ticket; they are the
first actions of a rule that change more than a notification.

### The target

Both actions carry a `target`: the technicians the ticket goes to.

| Field | Meaning |
| --- | --- |
| `kind` | `pool` — a row of `oncall_pools` (a readiness pool); `group` — a row of `groups` (a user group of the administration); `user` — one row of `users` (one technician of the installation, ADR-0033) |
| `id` | the UUID of that pool, group or user |

The **technicians of the target** are the active members of the group of the
target: for a pool the members of its `group_id`, otherwise every active user
holding the `oncall` role — the same rule as
`GET /api/v1/oncall/pools/:id/members` (`specs/04-oncall.md` §4a.5); for a group
the members of `user_groups`; for a user that one user, if the account is
active. A target without a technician changes nothing.

### The effect

| Action | Step | Effect |
| --- | --- | --- |
| `offer` | `offered` | the ticket leaves `WORK_ORDER_CREATED` for `OFFERED`. A pool target names the on-call person of the pool in `offered_to_user_id` and sets the offer timeout (`oncall.escalate_to_group_after_min`), so the existing offer timeout hands the ticket to the group; a group target has no on-call person and no timeout — the whole group is notified at once; a user target names that technician in `offered_to_user_id`. |
| `assign` | `assigned` | the ticket leaves `WORK_ORDER_CREATED` for `ASSIGNED`. Every technician of the target becomes an assignee of the ticket — a row of `ticket_assignees` (`specs/02-data-model.md` §4.12). |

Both actions perform a step of the `ticket_transitions` table (§7.13), so a
ticket whose status has no such step keeps its status and the action writes
nothing — the same rule as the `status_change` action. One append-only
`escalation_note` event records the distribution with
`{ rule, stage, target }`.

### The assignees of the ticket

The **assignees of a ticket** are the technicians who work on it: the
technicians of an assignment of the escalation and the technician who takes the
ticket himself — the `claimed` and the `accepted` step of the workflow,
performed by a user, write a row of `ticket_assignees`
(`specs/02-data-model.md` §4.13, ADR-0033). The rows are the current state of
the distribution, the events of the workflow stay its history.

### The notification

Every technician of the target is notified on the channels they selected for the
event type of `specs/10-notifications.md` §11.4: `ticket.escalated` for the
offer, `ticket.assigned` for the assignment. Only ntfy has an address per user
today (§11.3), so the broadcast writes one outbox row per technician with an
ntfy account on their own topic; the other channels of the instance reach the
office and are the business of the `notify` action. A technician without a
selection receives nothing.

The office is therefore informed twice over: the `escalated` event of the firing
and the `notify` action, if the rule carries one.

A `notify` action with the target `assigned` reaches the assignees of the
ticket instead of a fixed addressee (ADR-0033): the technician the escalation
assigned and the technician who took the ticket after an offer. The target
carries no id — the dispatcher reads the assignees of the ticket when the rule
fires; a ticket without an assignee reaches nobody.

