# WP-M2-41b: E2E fault-chip labels of the bootstrap list

format: small-model
status: planned
depends-on: WP-M2-41
phase: 2
context-budget: 6k tokens
spec: specs/02-data-model.md §4.5 (bootstrap table)
spec-lines: 20

files-read:

- apps/web/e2e/report-flow.spec.ts — the `ui.de.faultChip` / `ui.en.faultChip` fixtures
- apps/web/e2e/offline-report.spec.ts — the same fixtures
- apps/web/e2e/report-form.spec.ts — the same fixtures

files-write:

- apps/web/e2e/report-flow.spec.ts
- apps/web/e2e/offline-report.spec.ts
- apps/web/e2e/report-form.spec.ts

interfaces:

- E2E locale fixture `faultChip` names a chip that exists in the bootstrap list:
  German `Leitungsunterbrechung` or `Störung Melder`, English `Line interruption`
  or `Detector fault`

## Task

1. Point the `faultChip` fixture of every report E2E at a label from WP-M2-41.
   Nothing else in the flows changes.
2. Keep the de and en fixtures in sync, so both language runs click the same key.

## Non-goals

- No product code and no new E2E flow.
- No change to the test data, the viewport or the assertions.

## Acceptance

```bash
npm run test:e2e
npm run lint
npm run wp:check
```

Expected: green, or an explicit skip notice when no database/browser is available
(never reported as green).

## Handoff

- Files changed: the three report E2E specs
- Interfaces added: none
- Verified: —
- Follow-up WP: WP-M2-40b (catalog API)
- Open question: none
