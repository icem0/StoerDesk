# WP-M14-108: the spec names the single first stage

format: small-model
status: done
depends-on: WP-M14-107
phase: 14
milestone: m14
context-budget: 8k tokens
spec: specs/07-escalation.md §7.11
spec-lines: 10

files-read:

- specs/07-escalation.md
- docs/REPO-MAP.md

files-write:

- specs/07-escalation.md
- docs/REPO-MAP.md

interfaces:

- the spec names the single first stage of a chain, the rejected second stage
  without a predecessor and the removal of a stage without predecessor

## Task

1. State in §7.11 that a chain has exactly one stage without predecessor — the
   first stage — and that a second one is rejected.
2. State that only the first stage is protected and that a stage without
   predecessor of an earlier version may be removed.
3. Name the rule in the row of the escalation page of the module map.

## Non-goals

- No change of the behaviour.
- No new module.

## Acceptance

```bash
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the spec describes the delivered behaviour.

## Handoff

- Files changed: the spec, the module map and the repository bookkeeping
- Interfaces added: none — the record catches up with the fix
- Verified: `npm run check`
- Follow-up WP: none — the first stage of the chain is closed
- Open question: none
