# WP-M45-01: the shared contract knows the timer leaf

format: ctx-256k
status: done
depends-on: WP-M45-00
phase: 45
milestone: m45
context-budget: 55k tokens
spec: specs/07-escalation.md §7.2, §7.3, §7.4, §7.7
spec-lines: 120
changed-lines: 420

files-read:

- packages/shared/src/schemas/escalation-config.ts (the leaf schema, `EscalationFacts`, `evaluateEscalationCondition`, `DEFAULT_WORKFLOW_ESCALATION_RULES`)
- packages/shared/src/escalation.ts (the wall-clock and shift helpers of §7.4)
- packages/shared/src/**tests**/escalation-config.test.ts
- packages/shared/src/**tests**/escalation.test.ts
- specs/07-escalation.md §7.2–§7.7
- PLAN.md §3, §4.1, §17

files-write:

- packages/shared/src/schemas/escalation-config.ts
- packages/shared/src/escalation.ts
- packages/shared/src/**tests**/escalation-config.test.ts
- packages/shared/src/**tests**/escalation.test.ts

interfaces:

- `timer_expired` leaf: `operator` `expired` | `notExpired`, `value` =
  `{ reference: EscalationReferenceEvent, minutes: EscalationMinutes }` or
  `{ percent: 0–100 }`
- `EscalationFacts.sinceEvent: Record<string, number>` — minutes elapsed from
  every event that has happened (pauses excluded)
- `escalationTimerThreshold(condition, minutesSinceStartByKey, priority)` —
  the threshold of the firing log: the largest expired timer threshold in
  minutes, or `null` without a timer (§7.7)
- `EscalationRuleConfig.reference`, `minutes` and `percent` become **optional**
  deprecated fields in this package — WP-M45-02 removes them together with the
  seed and the columns, so no gate stays red in between

## Task

1. `escalation-config.ts`: add the `timer_expired` alternative to
   `escalationConditionLeafSchema` — operators `expired`/`notExpired`, value the
   union of `{ reference, minutes }` (the reference from
   `ESCALATION_REFERENCE_EVENTS`, minutes the same per-priority shape as the
   former rule field) and `{ percent }` (integer 0–100); a value with neither
   shape is rejected with the field paths.
2. Make `reference`, `minutes` and `percent` of `EscalationRuleConfig`
   **optional** (deprecated — the rule may omit them); the evaluator of a rule
   must no longer read them, only the timer leaf decides the clock. WP-M45-02
   removes the fields with the seed and the columns.
3. `evaluateEscalationCondition`: evaluate the leaf — `expired` matches when
   `facts.sinceEvent[reference]` exists and has reached `minutes[facts.priority]`
   (fallback `minutes.normal`); the percent variant compares
   `facts.deadlinePercent` against the percent; `notExpired` is the negation.
   An anchor that never happened never matches with `expired`.
4. `escalation.ts`: add `escalationTimerThreshold` — walks the condition tree,
   collects the thresholds of the `expired` timer leaves (minutes from the start
   value, given per key by the caller) and answers the largest or `null`;
   keep the pure-function contract.
5. Leave `DEFAULT_WORKFLOW_ESCALATION_RULES` unchanged in this package —
   WP-M45-02 rewrites them together with the columns, so the API still compiles
   and no gate stays red in between.
6. Tests: leaf validation of both shapes and a broken value; evaluation within
   and past the delay, per priority, anchor event missing, `notExpired`, percent
   leaf at 80/100 and a pause-excluded elapsed fact; `escalationTimerThreshold`
   over `all`/`any` groups and with several timers; the defaults assert the
   timers of the table of §7.2.

## Non-goals

- No database change (WP-M45-02), no engine change (WP-M45-03), no UI (WP-M45-04).
- No change of the other condition leaves and of the actions.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; `time_of_day` and the shift conditions keep working.

## Handoff

- Files changed: `packages/shared/src/schemas/escalation-config.ts` (the
  `timer_expired` leaf, `EscalationFacts.sinceEvent`, the evaluation,
  `escalationTimerLeaves`, the deprecated rule fields), `packages/shared/src/escalation.ts`
  (`escalationTimerThreshold`, `EscalationTimerClock`) and the two test files.
  The contract and the evaluator landed in `d2c98418` (v1.2.261); this commit
  completes the package with the threshold helper and the missing tests.
- Interfaces added: the `timer_expired` leaf (`expired`/`notExpired`, value
  `{ reference, minutes }` or `{ percent }` 1–100 — a timer of 0 % is no
  clock, the same bound as the former rule field), `EscalationFacts.sinceEvent`,
  `escalationTimerLeaves(condition)`, `escalationTimerThreshold(condition, clock)`.
  Deviation from the interface line: the threshold is an **instant** in epoch
  milliseconds, not minutes — the clock (`priority`, `startAt` per start value,
  `timeline` of the percent timer, `pausedBetween`) is handed over by the
  engine, so the pause arithmetic of the firing log stays in one pure place.
  An `all` group answers its largest timer, an `any` group its smallest, so the
  threshold of a rule is the same in every scan (the unique key of §7.7).
- `reference`, `minutes` and `percent` stay **nullable**, not optional: an
  optional field would break the API and the administration outside this
  package; WP-M45-02 removes them with the columns.
- The defaults keep the rule fields in this package (task 5); their timers are
  asserted by WP-M45-02 together with the rewritten seed.
- Verified: `npm run typecheck --workspaces --if-present`, `npm run lint`,
  `npm run test:run`, `npm run wp:check`
- Follow-up WP: WP-M45-02, WP-M45-03, WP-M45-04 exist as files since WP-M45-00
- Open question: none
