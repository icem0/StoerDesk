# WP-M6-07: escalation rule definitions

format: small-model
status: planned
depends-on: WP-M6-02
phase: 6
milestone: m6
context-budget: 18k tokens
spec: specs/07-escalation.md §7.1
spec-lines: 50

files-read:

- specs/07-escalation.md §7.1
- packages/shared/src/timeline.ts
- packages/shared/src/schemas/ticket.ts (status/priority values)
- apps/api/src/db/schema.ts (ticket status constants)

files-write:

- packages/shared/src/escalation.ts
- packages/shared/src/index.ts

interfaces:

- `ESCALATION_RULES` — rule key, reference (`received_at` or event type),
  minutes per priority, critical minutes, level
- `escalationRulesFor(priority, overrides?)` — resolved rule list
- `EscalationRule = { key, level, thresholdMs }`
- `EscalationLevel = 'office' | 'group' | 'assignee' | 'manager'`

## Task

1. Encode the six rules of `specs/07-escalation.md` §7.1 with their default and
   critical minutes and their addressee level.
2. `escalationRulesFor(priority, overrides)` substitutes a positive
   `minutes`/`criticalMinutes` override and returns the active thresholds.
3. Export from the shared index.
4. Unit test every default, the critical override and an invalid override
   (zero/negative keeps the default).

## Non-goals

- No database scan or event write (WP-M6-08).
- No pg-boss job (WP-M6-09).
- No notifications.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green.

## Handoff

- Files changed: shared escalation module, index export, unit test
- Interfaces added: the four exports above
- Verified: typecheck, lint, test:run
- Follow-up WP: WP-M6-08 (escalation scan)
- Open question: none
