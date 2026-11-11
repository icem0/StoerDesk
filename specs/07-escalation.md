# 07 — Escalation

**Chapter:** 8 (escalation) with the rules of `PLAN.md` §9
**Scope:** ~190 lines
**Status:** reviewed for phase 13 (WP-M13-01)

The binding summary is `PLAN.md` §9. This slice defines the escalation stages, the
waiting deadlines of the stages, the conditions under which a rule fires and the
actions a rule performs. The manual stage catalogue of the former §7.5 is gone: the
stages are the milestones of the ticket workflow.

## 7.1 The stages are the workflow milestones

A ticket walks through five stages. The stage keys are fixed by the workflow
(`apps/api/src/tickets/workflow.ts`); the display names are maintained in the
administration.

| Key | Stage | Waiting state | Reference of the clock |
| --- | --- | --- | --- |
| `review` | Prüfung / Review | `NEW` | `received_at` |
| `work_order` | Auftrag angelegt / Work order created | `IN_REVIEW` | `review_started` |
| `assignment` | Zuweisen oder Anbieten / Assign or offer | `WORK_ORDER_CREATED` | `work_order_set` |
| `acceptance` | Angenommen / Accepted | `OFFERED`, `ASSIGNED` | `offered`, `assigned` |
| `acknowledgement` | Quittiert / Acknowledged | `ACCEPTED` | `accepted` |

A stage is **reached** when the ticket enters the workflow state that follows the
milestone: `review_started`, `work_order_set`, `assigned`/`offered`, `accepted` and
`acknowledged`. The waiting state of a stage is the state the ticket is in while it
waits for that milestone.

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
| `review` | `received_at` | 15 | 15 | 15 | 5 |
| `work_order` | `review_started` | 30 | 30 | 30 | 30 |
| `assignment` | `work_order_set` | 30 | 30 | 30 | 30 |
| `acceptance` (offer) | `offered` | 20 | 20 | 20 | 10 |
| `acceptance` (assignment) | `assigned` | 15 | 15 | 15 | 15 |
| `acknowledgement` | `accepted` | 60 | 60 | 60 | 60 |

Two rules are not bound to a stage and use the ticket deadline instead of a
waiting clock: `deadline_80_percent` (80 % of the timeline) and `deadline_exceeded`
(100 % of the timeline). Their actions are configured like the actions of every
other rule.

## 7.3 Rules

A rule is the unit of configuration. It holds the trigger (which clock and which
minutes), the condition (when the rule applies at all) and the actions (what
happens when it fires).

| Field | Meaning |
| --- | --- |
| `key` | stable machine key, unique, the identity of the rule |
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

A condition group holds at most two levels and at most 20 leaves. The evaluation
is a pure function in `packages/shared`, used by the API and by the administration
form alike.

## 7.5 Actions

An action is what happens when a rule fires. Every action carries its own
condition, so one rule can notify the office always and the management only in
the night.

| Type | Configuration | Effect |
| --- | --- | --- |
| `notify` | `channels` (a subset of the configured channels) | one outbox row per channel, delivered by the outbox worker with its retry and fallback chain |
| `webhook` | `endpointIds` (webhook endpoints of the administration) | one delivery row per endpoint, sent with the HMAC signature and the backoff of the webhook worker |
| `history` | `text` (optional, 1–500 characters) | one append-only `escalation_note` event in the ticket history |

The actions of the first version never change a ticket: no status, no assignment,
no deadline. A rule writes the `escalated` event and performs its actions.

## 7.6 Data model

| Table | Columns |
| --- | --- |
| `escalation_stages` | `id`, `key` (unique, the fixed stage key), `names` (jsonb, one label per locale), `position`, `active` |
| `escalation_rules` | `id`, `key` (unique), `stage_key` (nullable foreign key), `reference`, `minutes` (jsonb, per priority), `percent` (nullable), `condition` (jsonb), `position`, `active` |
| `escalation_actions` | `id`, `key` (unique), `rule_key` (foreign key), `type`, `config` (jsonb), `condition` (jsonb), `position`, `active` |
| `escalation_firings` | `id`, `ticket_id`, `rule_key`, `threshold_at`, `fired_at` — unique over `(ticket_id, rule_key, threshold_at)` |

The `key` is the identity of a stage, a rule and an action, not the UUID: the
administration sends the keys, the server keeps the rows stable. The stages of an
installation are seeded once (the five keys of §7.1) and the rules are seeded from
the former settings values, so the deadlines of a running installation stay the
same after the migration.

## 7.7 Idempotency and the audit trail

A rule fires at most once per ticket, rule and threshold. The unique key of
`escalation_firings` carries that guarantee in the database, so a second scan of
the same minute cannot write a second event and cannot send a second webhook.

Every firing writes exactly one append-only `escalated` event with the payload
`{ rule, stage, thresholdAt, deadlineAt }` and performs the actions of the rule.
The `escalation_note` event of a `history` action carries the configured text.

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
| `PUT /api/v1/escalation/stages` | `settings.write` | replaces the names and the active flag of the stages |
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

The server answers the reachable stages with the ticket (`availableStages`), so
the transition map exists only in `apps/api/src/tickets/workflow.ts`.

## 7.11 Boundaries

- The manual stage catalogue, the `escalation_set` event and
  `POST /api/v1/tickets/:ticketNo/escalate` are removed: the workflow already
  records who reached which milestone.
- The escalation never changes a ticket state, an assignment or a deadline.
- Closed, cancelled, acknowledged and suspected-spam tickets never escalate.
- An open pause pauses the rule clock exactly as it pauses the timeline.
- The notifications of the first version are external systems only; there is no
  in-app escalation inbox.
