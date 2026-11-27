# ADR-0064: The waiting clock of an escalation rule is a condition

- Status: accepted
- Date: 2026-11-27
- Stakeholders: office, manager, admin
- Amends: ADR-0017 and ADR-0023 (the clock of a rule was a field of the rule and
  the predecessor carried the clock); decision 4 of ADR-0023 (the explicit
  `reference` of a rule) is gone.

## Context

The escalation rule of ADR-0017 and ADR-0023 held the waiting deadline as rule
fields: `escalation_rules.reference`, `minutes` and `percent`. The
administration grouped them into a frame „Zeitliche Abfolge“ (WP-M14-94). The
office said about `/admin/escalation`: „vor allem aber soll dieser Kasten mit
Zeitliche Abfolge aus den eskalationsstufen Feldern raus!!! nicht jede Stufe hat
oder braucht das! also rein in die Bedingung damit … dann wird es wieder ein
Stück übersichtlicher“ — and it asked for a condition that answers true once a
timer the office defines has elapsed: the timer has a start value the office
picks from the times of the ticket (report, review, work order, …), and the
delay belongs to the priority.

The office was right: no ADR ever decided to move the time out of the rule —
ADR-0017 and ADR-0023 kept it as the trigger of the rule („the predecessor
carries the clock“), and WP-M14-94 only framed it in the UI. The condition list
knew `elapsedMinutes` since WP-M13-15, but always against `received_at`, a
single number, no delay per priority — a partial step, not the shape the office
asked for.

## Decision

1. **The waiting clock is a condition.** A new leaf `timer_expired` in the
   condition of §7.4: `{ field: "timer_expired", operator: "expired" |
"notExpired", value }`. The value names the start value and the delay:
   `{ reference, minutes }` with `reference` one event of
   `received_at`, `review_started`, `work_order_set`, `offered`, `assigned`,
   `accepted` and `minutes` the delay per priority (`low`, `normal`, `high`,
   `critical`) — or `{ percent }` (0–100), the delay as a percentage of the
   timeline `received_at → deadline_at`.
2. **The rule fields are gone.** `escalation_rules.reference`, `minutes` and
   `percent` and the same fields in the contract disappear; a rule is its
   trigger stage, its condition and its actions. The frame „Zeitliche Abfolge“
   is gone from the rule form — not every stage has or needs a waiting time.
3. **What stays true after the expiry is the firing rule of §7.7, unchanged:**
   once the timer has expired **and** the rest of the condition holds, the rule
   fires exactly once per ticket, rule and threshold — one `escalated` event
   and the actions; a rule of a reached stage never fires again; an open pause
   stops the clock as the timeline does.
4. **A rule without a timer waits with zero delay.** A stage rule whose
   condition holds no `timer_expired` leaf is due from the moment its stage
   waits: the latest event of the `reached_by` of its predecessor (ADR-0023),
   or `received_at` without predecessor. The first stage still fires with the
   ticket itself; its condition still decides.
5. **The threshold of the firing log comes from the timers.** `threshold_at` is
   the largest of the thresholds of the `expired` timer leaves of the
   condition — each one the start event plus the delay of the priority of the
   ticket, plus the pauses inside. A percent timer: `received_at + percent` of
   the deadline span; a rule without a timer: the start of its wait.
6. **The evaluation stays a pure function.** `EscalationFacts` gains
   `sinceEvent` — minutes elapsed from every event that has happened, pauses
   excluded, computed by the API; the leaf compares it against the delay of
   the priority of the ticket. An anchor event that never happened never
   matches with `expired`; `notExpired` matches until it happened and its
   delay passed.
7. **The deadline rules become timers.** `deadline_80_percent` and
   `deadline_exceeded` stay stageless rules and carry `{ percent: 80 }` and
   `{ percent: 100 }` in their condition; the separate meaning of the
   percentage survives as the percent value of a timer.
8. **Installed rules are migrated.** Migration
   `0070_escalation_rule_timer.sql` rewrites `reference` and `minutes` of every
   stage rule and the `percent` of every deadline rule into a `timer_expired`
   leaf; an old condition that was not empty merges into an `all` group with
   the timer. Afterwards the three columns fall. The check that demanded one of the
   columns falls earlier with `0069_escalation_rule_clock_optional.sql`, so the
   engine and the administration can write a rule whose clock is its condition
   before the conversion runs. The read normalization of
   ADR-0063 brings an old body that still sends the three fields into the new
   contract the same way.
9. **The administration shows the timer in the condition builder.** The leaf
   renders the start value as a select over the events with their names and
   the delay as the four minutes fields per priority (or the percent field).
   The explanation of a rule says what the minutes are, which start value the
   clock begins at and what happens after the expiry.

## Alternatives

- **Keep the rule fields (status quo).** Rejected: the office wants the Kasten
  out of the stage fields and the time in the condition — one mechanism.
- **`elapsedMinutes` with a start value and a single number.** Rejected: the
  delay belongs to the priority; one number cannot express the seed.
- **A free expression language for the timer.** Rejected as in ADR-0017: the
  condition is a typed builder, not code the server runs.
- **Keep the columns nullable instead of a migration.** Rejected: the user
  chose conversion — nullable columns leave two ways to say the same clock.

## Consequences

- A rule reads: which stage, which condition (the timer among it), which
  actions — the rule form loses the frame and gets shorter.
- The chain of ADR-0023 keeps its remaining jobs: the order, the reached gate
  and the start of a rule without a timer; „the predecessor carries the clock“
  now only means „a rule without a timer waits from its predecessor“.
- The seed `DEFAULT_WORKFLOW_ESCALATION_RULES` carries the minutes of ADR-0008
  as timer conditions; `seededMinutesFor` in the UI and `escalationStageClockEvents`
  stay for the clock of a rule **without** a timer only.
- The firing audit of `escalation_firings` is unchanged; its `threshold_at`
  follows the timers.
- The help texts change: the minutes of a stage no longer „belong to the stage
  per priority“ — the delay belongs to the timer the office wrote in the
  condition, and the text names what happens after the expiry.
