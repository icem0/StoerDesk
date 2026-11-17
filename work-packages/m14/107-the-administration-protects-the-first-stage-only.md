# WP-M14-107: the administration protects the first stage only

format: small-model
status: done
depends-on: WP-M14-106
phase: 14
milestone: m14
context-budget: 12k tokens
spec: specs/07-escalation.md §7.11
spec-lines: 14

files-read:

- apps/web/src/admin/escalation-page.tsx
- apps/web/src/admin/__tests__/escalation-stage-tab.test.tsx

files-write:

- apps/web/src/admin/escalation-page.tsx
- apps/web/src/admin/__tests__/escalation-stage-tab.test.tsx

interfaces:

- only the first stage of the chain hides its remove action
- the predecessor select of a stage offers no stage without a predecessor
- the add row joins a new stage to the chain — the predecessor is mandatory

## Task

1. Protect the first stage of the chain with `escalationFirstStageKey` instead
   of every stage without a predecessor, so a second stage without a
   predecessor can be deleted again.
2. Disable the option "no predecessor" in the predecessor select of a stage.
3. Join a new stage to the chain: the add row offers no stage without a
   predecessor, the predecessor is mandatory and the default is the end of the
   chain.
4. Prove the add row in the stage tab test.

## Non-goals

- No change of the chain validation — the server rejects a second stage
  without a predecessor (WP-M14-105).
- No change of the names, the positions or the rules of a stage.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the stage tab passes (5/5).

## Handoff

- Files changed: the escalation page, the stage tab test and the repository
  bookkeeping
- Interfaces added: none — the administration protects the first stage only
- Verified: the stage tab 5/5, the rule editor 6/6, the web typecheck
- Follow-up WP: WP-M14-108 (the spec names the single first stage)
- Open question: none
