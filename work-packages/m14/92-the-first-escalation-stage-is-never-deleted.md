# WP-M14-92: the first escalation stage is never deleted

format: small-model
status: done
depends-on: WP-M14-91
phase: 14
milestone: m14
context-budget: 14k tokens
spec: specs/07-escalation.md §7.11
spec-lines: 12

files-read:

- apps/api/src/escalation/config.ts
- apps/web/src/admin/escalation-page.tsx
- apps/api/src/escalation/__tests__/stage-chain-exit.integration.spec.ts
- apps/web/src/admin/__tests__/escalation-stage-tab.test.tsx

files-write:

- apps/api/src/escalation/config.ts
- apps/web/src/admin/escalation-page.tsx
- apps/api/src/escalation/__tests__/stage-chain-exit.integration.spec.ts
- apps/web/src/admin/__tests__/escalation-stage-tab.test.tsx

interfaces:

- `PUT /api/v1/escalation/stages` rejects a missing or demoted first stage
- the administration hides the remove action and locks the predecessor of the
  first stage

## Task

1. Read the existing stage without predecessor before replacing the chain and
   reject a body that omits it or gives it a predecessor.
2. Disable the predecessor select and hide the remove action for the first stage
   in the stage tab.
3. Cover both the API rejection and the locked controls.

## Non-goals

- No protection of the interaction with the name or the active flag.
- No new endpoint or schema field.
- No data migration.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the stage chain suite passes (5/5), the stage tab suite 4/4.

## Handoff

- Files changed: the stage writer, the stage tab, both tests and the repository
  bookkeeping
- Interfaces added: the first-stage guard of the stage PUT
- Verified: web typecheck, stage tab 4/4, stage chain 5/5
- Follow-up WP: WP-M14-93 (note action as comment)
- Open question: none
