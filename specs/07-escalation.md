# 07 — Escalation

**Chapter:** 8 (escalation) with the rules of `PLAN.md` §9
**Scope:** ~80 lines
**Status:** reviewed for phase 6 (WP-M6-01)

The binding summary is `PLAN.md` §9. This slice details the rules, their
idempotent representation and the job that runs them.

## 7.1 Rules

All rules run 24/7. The minute values are defaults per priority; a rule with a
critical override uses the shorter value for `critical`.

| Rule key | Condition | Default | Critical |
| --- | --- | --- | --- |
| `new_without_review` | `status = NEW`, measured from `received_at` | 15 min | 5 min |
| `work_order_without_distribution` | `status = WORK_ORDER_CREATED`, measured from the `work_order_set` event | 30 min | 30 min |
| `offered_without_claim` | `status = OFFERED`, measured from the last `offered` event | 20 min | 10 min |
| `assigned_without_accept` | `status = ASSIGNED`, measured from the last `assigned` event | 15 min | 15 min |
| `deadline_80_percent` | the timeline reached 80 % and the ticket is not acknowledged | — | — |
| `deadline_exceeded` | `deadline_at` passed and the ticket is not acknowledged | — | — |

Closed, cancelled, acknowledged and suspected-spam tickets never escalate. An
open pause pauses the rule clock exactly as it pauses the timeline
(`specs/05-timeline.md` §5.3): the elapsed time of a rule is measured from its
reference event to `now` minus the pauses that overlap that interval.

The default values live in the shared `ESCALATION_RULES` constant; the
`settings` rows `ticket.escalation.<rule>.minutes` and
`ticket.escalation.<rule>.critical_minutes` override a default when they hold a
positive integer.

## 7.2 Representation and idempotency

Every fired rule writes exactly one append-only event:

```json
{
  "type": "escalated",
  "actor_kind": "system",
  "payload": {
    "rule": "deadline_exceeded",
    "level": "manager",
    "thresholdAt": "…",
    "deadlineAt": "…"
  }
}
```

`level` names the addressee of the rule so phase 7 can route it:
`office`, `group`, `assignee` or `manager`. The event is the history entry the
exit criterion of phase 6 requires. A rule never fires twice for the same
ticket, rule and threshold: the scan looks for an existing `escalated` event
with that `payload.rule` and `payload.thresholdAt` before inserting.

The insert is one transaction per ticket. A failed insert never changes the
ticket row: escalation does not rewrite state, it records it.

## 7.3 Job

`apps/api/src/jobs/escalation.ts` owns the pg-boss queue
`ticket-escalation`. It is scheduled every minute (`* * * * *`) and started only
from the direct API start, like `qr-token-cleanup` and `bma-anlage-sync`;
`buildServer()` and the integration tests never create the pg-boss schema. Every
run opens its own short-lived pool, scans the open tickets in one query and
writes the events with the service of §7.2.

The job logs only counts and rule keys, never ticket content, contact data or
user names (`PLAN.md` §15).

## 7.4 Boundaries

- Notifications are phase 7: the `escalated` event is the handoff into the
  outbox worker, this phase sends nothing.
- No ticket state change: a red ticket stays red until the office acts.
- No escalation of an acknowledged ticket; reopening with a later phase needs
  its own decision, because `acknowledged_at` is not cleared here.
- The job never edits a `ticket_events` row; corrections are new events
  (`specs/02-data-model.md` §4.9).

## 7.5 Manual escalation stages

The office drives a manual escalation from the ticket detail view. The stages
are freely defined in the administration (WP-M12-04) and stored as the ordered
`settings` row `ticket.escalation_stages`:

```json
{
  "stages": [
    { "key": "office", "names": { "de": "Büro", "en": "Office" }, "deadlineMinutes": 15 },
    { "key": "group", "names": { "de": "Gruppe", "en": "Group" }, "deadlineMinutes": 30 }
  ]
}
```

The array order is the escalation order. Every stage carries at least the names
`de` and `en`; the `names` record accepts more locales without a schema change.
`deadlineMinutes` (1–10080) is the reaction deadline of the stage and applies to
all priorities.

`POST /api/v1/tickets/:ticketNo/escalate` is guarded by `ticket.comment` and
accepts `{ "stageKey": string | null, "text": string }`. `stageKey = null` writes
a `comment` event; a known stage key writes one `escalation_set` event with the
snapshot `{ stageKey, stageName, text }`. The stage may be chosen forwards or
backwards, so an acknowledged or accepted ticket can return to an earlier stage.
An unknown stage key answers `400 invalid_request`. A manual escalation changes
no status, assignment, deadline or notification: it records who escalated to
which stage and why.

The ticket view preselects the stage after the last `escalation_set` stage (the
first stage when there is none, the last stage at the end of the chain) and
offers "Kommentar" next to the configured stages. `GET /api/v1/escalation-stages`
answers the catalog to every holder of `ticket.read`.

