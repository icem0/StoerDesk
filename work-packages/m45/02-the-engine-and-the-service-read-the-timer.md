# WP-M45-02: the engine and the configuration service read the timer

format: ctx-256k
status: planned
depends-on: WP-M45-01
phase: 45
milestone: m45
context-budget: 60k tokens
spec: specs/07-escalation.md §7.2, §7.4, §7.7, §7.11; PLAN.md §9
spec-lines: 120
changed-lines: 520

files-read:

- apps/api/src/tickets/escalation.ts (`decisionFor`, `factsFor`, `stageReferenceTime`, `referenceTime`, the first-stage path)
- apps/api/src/escalation/config.ts (`readEscalationConfig`, `writeEscalationConfig`, `normalizeEscalationRows` of ADR-0063, `escalationStageClockEvents` use)
- apps/api/src/jobs/escalation.ts (the minute scan — expected unchanged)
- apps/api/src/tickets/**tests**/escalation.integration.spec.ts, apps/api/src/escalation/**tests**/legacy-config-rows.test.ts and the phase-13 exit integration test
- packages/shared/src/schemas/escalation-config.ts (after WP-M45-01)
- specs/07-escalation.md §7.7 and §7.11

files-write:

- packages/shared/src/schemas/escalation-config.ts
- packages/shared/src/**tests**/escalation-config.test.ts
- apps/api/src/tickets/escalation.ts
- apps/api/src/escalation/config.ts
- apps/api/src/tickets/**tests**/escalation.integration.spec.ts
- apps/api/src/escalation/**tests**/legacy-config-rows.test.ts
- apps/api/src/escalation/**tests**/phase13-exit.integration.spec.ts

interfaces:

- `escalationRuleTimerCondition(rule, stageReference)` (shared) — the clock of
  the old rule fields as a condition: `reference`+`minutes` (a missing
  reference takes `stageReference`, the first clock event of the stage) or
  `percent` become one `timer_expired` leaf, merged with a non-empty condition into
  `{ all: [timer, condition] }`; the fields of the answer are `null`. The
  migration `0069` of WP-M45-04 writes the same shape
- `escalationExpiredTimers(condition, priority)` — the `expired` timer leaves
  of a condition with the delay of the priority of the ticket; the engine turns
  them into the threshold of the firing log (the latest expiry point, pauses
  inside, §7.7). It replaces the `escalationTimerThreshold` announced by
  WP-M45-01: a threshold in minutes cannot compare timers of different start
  events
- `escalationConditionWithoutTimers(condition)` — the condition of a
  first-stage rule: every timer leaf counts as met (§7.2, §7.11 — the first
  stage is due with the ticket, independent of its timer)
- `factsFor` answers `sinceEvent`: minutes from every event of
  `received_at`, `review_started`, `work_order_set`, `offered`, `assigned`,
  `accepted` to now, pauses excluded — the facts of the timer leaf
- due-ness of a stage rule: the rule is due when **all** `expired`
  `timer_expired` leaves of its condition have passed their delay (threshold
  = the moment the largest one expired, pauses inside); a rule **without** a
  timer is due from the start of its wait (the reached predecessor of §7.11,
  zero delay)
- the firing log keeps its shape: `threshold_at` from the timer, unique over
  `(ticket_id, rule_key, threshold_at)` — unchanged

## Task

1. Shared: add `escalationRuleTimerCondition`, `escalationExpiredTimers` and
   `escalationConditionWithoutTimers` next to `escalationTimerLeaves`. The rule fields `reference`, `minutes` and
   `percent` stay in the contract (deprecated, nullable) until WP-M45-04 drops
   them with the columns — the read paths convert them, nothing reads them as a
   clock any more.
2. `tickets/escalation.ts`: `readEscalationRules` converts every row with the
   shared helper (a row without `reference` takes the clock of its stage);
   compute `sinceEvent` from the ticket events and the pauses (the pause
   arithmetic of the timeline — the same subtraction the old clock used);
   `factsFor` returns the new fact.
3. `decisionFor`: drop the rule-field clock. A rule whose condition holds
   `expired` timers is due when the elapsed minutes of **each** timer reached
   its delay of the priority of the ticket; the percent timer keeps the
   threshold point of the timeline. A rule without timers keeps the start of
   its wait from the chain (ADR-0064 decision 4) as its threshold. The
   first-stage rule still fires with the ticket itself, independent of its
   timer (§7.2, §7.11): its condition decides with every timer leaf counted
   as met.
4. `config.ts`: the read normalization of ADR-0063 gains one rule: a row that
   still names `reference`/`minutes`/`percent` is answered with the timer leaf
   of the shared helper and `null` fields — the administration loads every old
   configuration in the new shape, and a save writes the timer into the
   condition and `null` into the columns. The check of an explicit `reference`
   against the stage clock (WP-M113/114) applies only to a row that still
   names one.
5. Tests: a timer past its delay of the priority fires once and a second scan
   is a no-op; the delay of another priority does not fire; an anchor event
   missing keeps the rule silent; `notExpired` gates the firing; the percent
   timer fires at 80 % and 100 % of the timeline (the deadline rules of the
   phase-13 exit criterion); a rule without a timer fires from the predecessor
   with zero delay; an old row with columns behaves exactly as before; the
   pause arithmetic of the threshold is proven like before.

## Non-goals

- No UI change (WP-M45-03), no schema or migration change (WP-M45-04), no
  action semantics.
- No change of the readiness scan, the `shift` facts or `time_of_day`.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the phase-13 exit criterion still proves: one firing per
ticket, rule and threshold, the 80 % and 100 % deadline firings, a
non-matching condition keeps the rule silent.

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: WP-M45-03, WP-M45-04 exist as files since WP-M45-00 (re-cut 2026-11-27)
- Open question (if any):
