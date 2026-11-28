# WP-M45-03: the engine and the configuration service read the timer

format: ctx-256k
status: done
depends-on: WP-M45-01
phase: 45
milestone: m45
context-budget: 55k tokens
spec: specs/07-escalation.md §7.2, §7.4, §7.7, §7.11; PLAN.md §9
spec-lines: 120
changed-lines: 420

files-read:

- apps/api/src/tickets/escalation.ts (`decisionFor`, `factsFor`, `stageReferenceTime`, `referenceTime`, the first-stage path)
- apps/api/src/escalation/config.ts (`readEscalationConfig`, `writeEscalationConfig`, `normalizeEscalationRows` of ADR-0063, `escalationStageClockEvents` use)
- apps/api/src/jobs/escalation.ts (the minute scan — expected unchanged)
- apps/api/src/tickets/**tests**/escalation-*.test.ts and the phase-13 exit integration test
- packages/shared/src/schemas/escalation-config.ts (after WP-M45-02)
- specs/07-escalation.md §7.7 and §7.11

files-write:

- apps/api/src/tickets/escalation.ts
- apps/api/src/escalation/config.ts
- packages/shared/src/escalation.ts
- apps/api/src/tickets/**tests**/escalation-timer.integration.spec.ts
- apps/api/src/escalation/**tests**/legacy-config-rows.test.ts

interfaces:

- `factsFor` answers `sinceEvent`: minutes from every event of
  `received_at`, `review_started`, `work_order_set`, `offered`, `assigned`,
  `accepted` to now, pauses excluded — the facts of the timer leaf
- due-ness of a stage rule: the rule is due when **all** `expired`
  `timer_expired` leaves of its condition have passed their delay (threshold
  = the largest one, pauses inside); a rule **without** a timer is due from the
  start of its wait (the reached predecessor of §7.11, zero delay)
- the firing log keeps its shape: `threshold_at` from the timer, unique over
  `(ticket_id, rule_key, threshold_at)` — unchanged

## Task

1. `escalation.ts`: compute `sinceEvent` from the ticket events and the pauses
   (the pause arithmetic of the timeline — the same subtraction the old clock
   used); `factsFor` returns the new fact.
2. `decisionFor`: drop the rule-field clock. A rule whose condition holds
   `expired` timers is due when the elapsed minutes of **each** timer reached
   its delay of the priority of the ticket — reuse
   `escalationTimerThreshold` of WP-M45-01 to derive `thresholdAt`; a rule
   without timers keeps the start of its wait from the chain (ADR-0064
   decision 4) as its threshold. The first-stage rule still fires with the
   ticket creation right after the transaction, its condition (timer included)
   decides — a first-stage rule with a timer waits like any other rule of the
   chain start.
3. `config.ts`: the write path validates the condition leaves with the shared
   schema (the timer leaf needs no extra target check); the read normalization
   of ADR-0063 gains one rule: a row of an older installation that still names
   `reference`/`minutes`/`percent` maps into a `timer_expired` leaf the same way
   the migration `0069` does — the administration can load every old
   configuration. The check of an explicit `reference` against the stage clock
   (WP-M113/114) is gone with the field.
4. Tests: a timer past its delay of the priority fires once and a second scan
   is a no-op; the delay of another priority does not fire; an anchor event
   missing keeps the rule silent; `notExpired` gates the firing; the percent
   timer fires at 80 % and 100 % of the timeline (the deadline rules of the
   phase-13 exit criterion follow the new shape); a rule without a timer fires
   from the predecessor with zero delay; the pause arithmetic of the threshold
   is proven like before.

## Non-goals

- No UI change (WP-M45-04), no schema or migration change, no action semantics.
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

- **Order changed: this package runs before WP-M45-02.** WP-M45-02 drops the
  columns and rewrites the seed as timers; an engine that still read the rule
  fields would stop firing and the phase-13 exit criterion would go red between
  the two commits. So the engine learns the timer first, while the rows still
  carry the old fields — `readEscalationRules` turns them into the timer leaf
  with `escalationRuleTimerCondition`, the same conversion the migration `0069`
  of WP-M45-02 applies to the rows. WP-M45-02 now depends on this package.
- Files changed: `apps/api/src/tickets/escalation.ts` (`sinceEvent`,
  `startInstants`, `decisionFor` from the timers, the first stage with
  `withoutTimers`), `apps/api/src/escalation/config.ts`
  (`escalationRuleTimerCondition`), `packages/shared/src/escalation.ts` (the
  threshold walks the pauses to a fixed point), the new
  `apps/api/src/tickets/__tests__/escalation-timer.integration.spec.ts` and
  `apps/api/src/escalation/__tests__/legacy-config-rows.test.ts`. The named
  files `tickets/escalation.test.ts` and `escalation/__tests__/escalation-config.test.ts`
  do not exist; the tests live in the two files above, the phase-13 exit
  criterion stays green unchanged.
- Interfaces added: `escalationRuleTimerCondition(rule, stages)`; the facts
  carry `sinceEvent`. The first stage stays due with the ticket **independent
  of its timer** (§7.2, §7.11 — the timer leaves count as expired there), the
  rest of its condition decides. A rule without a timer is due from the start
  of its wait, a stageless rule without a timer from `received_at`.
- The threshold now moves behind every pause inside the span, also one that
  begins after the nominal expiry — the old arithmetic counted only the pauses
  before it, so the threshold and the elapsed minutes of the facts could
  disagree.
- Not in this package: the write path of the configuration still stores the
  rule fields (the columns and the CHECK `escalation_rules_clock_check` exist
  until WP-M45-02); the normalization of an old body and the removal of the
  reference repair of `writeEscalationStages` move to WP-M45-02 with the columns.
- Verified: `npm run typecheck --workspaces --if-present`, `npm run lint`,
  `npm run test:run` (with PostgreSQL 16), `npm run wp:check`
- Follow-up WP: WP-M45-02 and WP-M45-04 exist as files since WP-M45-00
- Open question: none
