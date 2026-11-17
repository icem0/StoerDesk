# WP-M14-94b: the module map names the frame of the time sequence

format: small-model
status: done
depends-on: WP-M14-94
phase: 14
milestone: m14
context-budget: 8k tokens
spec: specs/07-escalation.md §7.2, §7.3, §7.11
spec-lines: 10

files-read:

- docs/REPO-MAP.md

files-write:

- docs/REPO-MAP.md

interfaces:

- the row of the escalation page names the frame of the time sequence of a rule
  and the key of the stage

## Task

1. Name the read-only key of the stage and the frame `admin.escalation.rule.timeline`
   of the rule form in the row of the escalation page of the module map.

## Non-goals

- No change of a module.
- No new row.

## Acceptance

```bash
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green.

## Handoff

- Files changed: the module map and the repository bookkeeping
- Interfaces added: none
- Verified: the commit `523f9a1` and the map of the module
- Follow-up WP: WP-M14-95 (the map catches up with the whole phase 14)
- Open question: none
