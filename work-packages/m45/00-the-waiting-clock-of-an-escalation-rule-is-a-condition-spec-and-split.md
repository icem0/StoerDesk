# WP-M45-00: the waiting clock as a condition — the decision, the spec and the split

format: ctx-256k
status: done
depends-on: WP-M44-01
phase: 45
milestone: m45
context-budget: 50k tokens
spec: PLAN.md §9, §16, §17, §19; specs/07-escalation.md §7.2, §7.3, §7.4, §7.6, §7.7, §7.11
spec-lines: 160
changed-lines: 360

files-read:

- PLAN.md §9 (timeline and escalation), §16 (phases and record), §17 (WP rules), §19 (open decisions)
- specs/07-escalation.md (the whole slice)
- docs/DECISIONS/0017-workflow-stages-as-escalation-stages.md, 0023-escalation-stage-chain-configurable.md, 0063-the-escalation-read-normalizes-the-rows-of-an-older-installation.md
- docs/DECISIONS.md, work-packages/README.md (the backlog)
- work-packages/m43/01-the-decision-and-the-specification-of-the-switch.md (the pattern of a split package)
- apps/web/src/admin/escalation-page.tsx (the frame „Zeitliche Abfolge“, WP-M14-94)

files-write:

- docs/DECISIONS/0064-the-waiting-clock-of-an-escalation-rule-is-a-condition.md
- docs/DECISIONS.md
- specs/07-escalation.md
- PLAN.md
- work-packages/README.md
- work-packages/m45/00-the-waiting-clock-of-an-escalation-rule-is-a-condition-spec-and-split.md
- work-packages/m45/01-the-shared-contract-knows-the-timer-leaf.md
- work-packages/m45/02-the-migration-converts-the-rules-and-the-seed.md
- work-packages/m45/03-the-engine-and-the-service-read-the-timer.md
- work-packages/m45/04-the-administration-puts-the-timer-in-the-condition.md

interfaces:

- ADR-0064 — the waiting clock of an escalation rule is a condition
- `timer_expired` condition leaf of `specs/07-escalation.md` §7.4 (start value +
  delay per priority or percent of the timeline)
- migration `0069_escalation_rule_timer.sql` (announced, written in WP-M45-02)
- the phase 45 row of PLAN.md §16 and the resolved decision of §19

## Task

This package is the **decision, the spec and the split** — it writes no product
code:

1. **The comment of the office.** „vor allem aber soll dieser Kasten mit Zeitliche
   Abfolge aus den eskalationsstufen Feldern raus!!! nicht jede Stufe hat oder
   braucht das! also rein in die Bedingung damit … dann wird es wieder ein Stück
   übersichtlicher“ — the office asks for a condition that answers true once a
   timer it defines has elapsed: the timer has a start value chosen from the
   times of the ticket (report, review, work order, offer, assignment,
   acceptance) and a delay per priority. Check of the record: no ADR ever
   decided this — ADR-0017 and ADR-0023 kept the clock as the trigger of the
   rule (decision 4 of ADR-0023 names the explicit `reference`) and WP-M14-94
   only framed the fields in the UI. The step was never announced, so it was
   never implemented.
2. Write `docs/DECISIONS/0064-the-waiting-clock-of-an-escalation-rule-is-a-
condition.md` (the nine decisions and the alternatives) and register it in
   the index of `docs/DECISIONS.md`.
3. Amend `specs/07-escalation.md`: §7.2 the clock is the `timer_expired` leaf
   (the seed of ADR-0008 as timers, the deadline rules as percent timers), §7.3
   the rule fields are gone, §7.4 the leaf with both value shapes, §7.6 the
   columns die with `0069`, §7.7 the threshold follows the timers, §7.11 the
   chain starts a rule **without** a timer with zero delay and the explicit
   `reference` is gone.
4. `PLAN.md` §9 names the leaf and the firing sentence; §16 gains the phase-45
   row and the record; §19 resolves the shape of the escalation clock by ADR-0064.
5. Create the four child WP files (WP-M45-01 … WP-M45-04) **in this commit**
   and announce them in the backlog of `work-packages/README.md` — the phase
   row and the five rows of the open follow-ups.

## Non-goals

- No product code, no schema, no migration in this package: the decision decides,
  the code follows.
- No change of the stage chain semantics (order, reached gate, the buttons of
  the ticket view) beyond the clock.
- No change of the timeline bar of the ticket (§9 of PLAN.md) and of the
  `deadlinePercent` condition leaf.

## Acceptance

```bash
npm run lint
npm run wp:check
npm run check
```

Expected: all green; `wp:check` validates the four new child WP files; the
decision, the slice and the plan name one and the same model.

## Handoff

- Files changed: the decision, the index of the decisions, the slice, the plan
  and the backlog; the five WP files of phase 45
- Interfaces added: ADR-0064, the `timer_expired` leaf in the slice, the phase-45
  row, the resolved decision of §19
- Verified: the commands above
- Follow-up WP: WP-M45-01 (the shared contract and the evaluator), WP-M45-02
  (the migration and the seed), WP-M45-03 (the engine and the configuration
  service), WP-M45-04 (the administration) — the files exist in this commit
- Open question: none
