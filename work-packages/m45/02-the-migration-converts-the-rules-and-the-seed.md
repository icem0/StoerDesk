# WP-M45-02: the migration converts the rules and the seed carries the timers

format: ctx-256k
status: planned
depends-on: WP-M45-03
phase: 45
milestone: m45
context-budget: 55k tokens
spec: specs/07-escalation.md §7.2, §7.6, §7.11; ADR-0064 decision 7 and 8
spec-lines: 120
changed-lines: 480

files-read:

- packages/shared/src/schemas/escalation-config.ts (rule schema and defaults after WP-M45-01)
- apps/api/src/db/schema.ts (`escalationRules`, the CHECK `escalation_rules_clock_check`)
- apps/api/src/db/seed-escalation.ts (the seed of a fresh installation)
- apps/api/src/db/migrations/0031_escalation_config.sql, 0038_escalation_rule_stage_clock.sql, 0045_escalation_rule_numbering.sql, 0046_escalation_stage_new.sql (the pattern of a conversion)
- apps/api/src/db/**tests**/seed-escalation.integration.spec.ts, escalation-rule-numbering.integration.spec.ts, escalation-stage-new.integration.spec.ts
- specs/07-escalation.md §7.2/§7.6

files-write:

- apps/api/src/db/migrations/0069_escalation_rule_timer.sql
- apps/api/src/db/schema.ts
- apps/api/src/db/seed-escalation.ts
- packages/shared/src/schemas/escalation-config.ts
- packages/shared/src/**tests**/escalation-config.test.ts
- apps/api/src/db/**tests**/escalation-rule-timer.integration.spec.ts
- apps/api/src/db/**tests**/seed-escalation.integration.spec.ts

interfaces:

- migration `0069_escalation_rule_timer.sql` — `reference`+`minutes` of every
  stage rule and the `percent` of every deadline rule become a
  `timer_expired` leaf in the `condition` jsonb; an old condition that was not
  empty merges into an `all` group with the timer; afterwards the columns
  `reference`, `minutes` and `percent` fall
- `DEFAULT_WORKFLOW_ESCALATION_RULES` carries the seed of ADR-0008 as
  `timer_expired` conditions — the start values of the §7.2 table, the
  deadline rules `{ percent: 80 }` and `{ percent: 100 }`
- `EscalationRuleConfig` no longer knows `reference`, `minutes` or `percent`

## Task

1. Write the migration `0069_escalation_rule_timer.sql` following the pattern
   of `0045`/`0046`: for every active and inactive rule build the timer json —
   a rule with `percent` gets `{ percent }`, a rule with `minutes` gets
   `{ reference: <reference or the clock of its stage>, minutes }`; merge the
   timer and the old condition into `{ all: [ … ] }` (an empty or `{ all: [] }`
   condition keeps just the timer), write the merged condition and then drop
   the three columns — drizzle-kit shape with `-->` breakpoints, the CHECK of
   0038 falls with its columns.
2. `schema.ts`: `escalationRules` loses the three columns; the stage foreign
   key, the numbering and the clock of a rule **without** a timer are untouched.
3. `seed-escalation.ts` and `DEFAULT_WORKFLOW_ESCALATION_RULES`: the seed of a
   fresh installation writes the conditions of §7.2 — the minutes of ADR-0008
   sit in the `timer_expired` leaf, the deadline rules in the percent variant;
   the rule of the first stage `new` keeps its timer (it still fires with the
   ticket, §7.11).
4. Tests: the integration test of `0069` follows the pattern of the numbering
   and the stage-`new` tests — an installed configuration (seeded before the
   migration, e. g. via `0066` state) comes out of the migration with the
   timer conditions of its old fields, the merged conditions of rules that
   already had one, the keys and the firing log untouched and no column of the
   old clock left; the seed test asserts the §7.2 table on the rows.

## Non-goals

- No engine change (WP-M45-03 reads the timers there), no administration UI
  (WP-M45-04).
- No change of `escalation_stages` and `escalation_actions`.
- No new rule, no renamed rule: the keys stay (ADR-0064 changes the clock, not
  the identity).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; a database migrated to `0069` reads its rules through the
contract of WP-M45-01 without the old fields.

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: WP-M45-03, WP-M45-04 exist as files since WP-M45-00
- Open question (if any):
