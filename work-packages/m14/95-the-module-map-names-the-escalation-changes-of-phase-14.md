# WP-M14-95: the module map names the escalation changes of phase 14

format: small-model
status: done
depends-on: WP-M14-94
phase: 14
milestone: m14
context-budget: 10k tokens
spec: specs/07-escalation.md §7.5, §7.6, §7.11
spec-lines: 20

files-read:

- docs/REPO-MAP.md

files-write:

- docs/REPO-MAP.md

interfaces:

- the module table names the recipient and the priority of a `notify` action
- the module table names the comment of a `history` action and the internal key
- the module table names the immediate first stage and its protection

## Task

1. Name the recipient target and the ntfy priority of a `notify` action, the
   validation of the target and the generated key of a `history` action in the
   rows of the configuration service and the dispatcher.
2. Name the recipient select of the action editor and the hidden key of a note
   action in its row.
3. Name the immediate first stage and the protection of the stage writer in the
   row of the escalation page.

## Non-goals

- No change of a module, of a row count or of the structure of the map.
- No new row.

## Acceptance

```bash
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the map stays under its line limit and names the changes.

## Handoff

- Files changed: the module map and the repository bookkeeping
- Interfaces added: none — the map catches up with phase 14
- Verified: `npm run check`
- Follow-up WP: none
- Open question: none
