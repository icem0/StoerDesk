# WP-M14-103: the spec and the module map name the taxonomy

format: small-model
status: done
depends-on: WP-M14-102
phase: 14
milestone: m14
context-budget: 10k tokens
spec: specs/07-escalation.md §7.3, §7.5, §7.6, §7.7
spec-lines: 30

files-read:

- specs/07-escalation.md
- docs/REPO-MAP.md

files-write:

- specs/07-escalation.md
- docs/REPO-MAP.md

interfaces:

- the spec names the taxonomy of the keys and the migration that gives an
  installed configuration the numbered keys
- the module map names the derived keys and the numbers of the administration

## Task

1. Describe the taxonomy of §7.5 in the spec: the key of a stage is free, the
   key of a rule is the key of its stage and its number, the key of an action
   the key of its rule and its number, a rule without a stage belongs to the
   root `deadline`; the server writes the keys, the administration numbers the
   rules and the actions.
2. Correct the field table of the rules, the note about the history action and
   the paragraph about the identity of a key.
3. Name the derived keys and the numbers in the rows of the configuration
   service, the dispatcher, the action editor and the escalation page.

## Non-goals

- No change of the behaviour.
- No new module.

## Acceptance

```bash
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the spec and the map describe the delivered behaviour.

## Handoff

- Files changed: the spec, the module map and the repository bookkeeping
- Interfaces added: none — the record catches up with the feature
- Verified: `npm run check`
- Follow-up WP: none — the taxonomy of the escalation is closed
- Open question: none
