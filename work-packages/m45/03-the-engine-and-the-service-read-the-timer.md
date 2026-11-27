# WP-M45-03: the engine and the configuration service read the timer

format: ctx-256k
status: done
depends-on: WP-M45-02
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
- apps/api/src/tickets/escalation.test.ts
- apps/api/src/escalation/**tests**/escalation-config.test.ts
- apps/api/src/tickets/**tests**/phase13-exit.integration.spec.ts

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

- Files changed: `tickets/escalation.ts` (`sinceEvent`, `decisionFor` from the timer leaves, `timerThreshold`), `escalation/config.ts` (the read normalization and the write path turn the old clock fields into a timer; the `reference`-against-stage-clock check and the reference fallback of `writeEscalationStages` are gone with the field), the integration and unit tests of the engine and the service. Landed together with WP-M45-02 (see there).
- Interfaces added: `factsFor` answers `sinceEvent`; a rule is due when every `expired` timer has passed its delay of the priority (threshold = the largest one, pauses inside); a stage rule without a timer is due from the start of its wait; the first-stage rule is due with the ticket and its condition decides without the timer
- Verified: `escalation-timer.integration.spec.ts` (fires once and a second scan is a no-op, another priority stays silent, a start value that never happened stays silent, `notExpired` gates, the percent timer at 80 and 100 percent, zero delay from the predecessor, the pause arithmetic, the largest of several timers); the phase-13 exit criterion follows the new shape; typecheck of the three workspaces, `eslint .` (0 errors), the full `vitest run` against a throwaway PostgreSQL 17 (2177 of 2178 green; the one failure `web-push-esm.spec.ts` fails the same way before the change), `npm run build`, `wp:check`; `npm run i18n:check` was run with a copy of the script that splits the paths on both separators — the script itself reports 1654 phantom keys on Windows (it splits on `/`); `npm run test:e2e` was not run here (unverified)
- Follow-up WP: WP-M45-04 exists as a file since WP-M45-00
- Open question: none
