# WP-M14-66: The stage tab of the administration is tested

format: small-model
status: done
depends-on: WP-M14-65
phase: 14
context-budget: 18k tokens
spec: specs/07-escalation.md §7.11; PLAN.md §14, §18
spec-lines: 80

files-read:

- apps/web/src/admin/escalation-page.tsx
- apps/web/src/admin/__tests__/escalation-page-localization.test.tsx
- apps/web/src/i18n/locales/de/settings.json

files-write:

- apps/web/src/admin/__tests__/escalation-stage-tab.test.tsx

interfaces:

- the component test of the stage tab: add, remove, predecessor select, error text

## Task

1. `escalation-stage-tab.test.tsx` (the UI component test of the stage tab):
   the tab renders the stages of the served config in `position` order; the
   predecessor select offers the other stages plus "kein Vorgänger"; the add row
   renders the key field and the two name fields; the remove action renders
   together with the cascade hint.
2. Assert the texts of `de` and `en` for the keys added in WP-M14-65
   (`admin.escalation.stage.predecessor`, `.add`, `.remove`,
   `admin.escalation.errors.stageChainInvalid`).
3. Assert that a save with an empty key does not send a request.

## Non-goals

- No production code change, no new page, no new namespace.
- No Playwright E2E here (WP-M14-67 runs the throwaway-database criterion).
- No change of the rule and action editors.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the test fails before WP-M14-65 and passes after it.

## Handoff

- Files changed: `apps/web/src/admin/__tests__/escalation-stage-tab.test.tsx`
- Interfaces added: four page tests cover the served stage order, the predecessor options, the add row, the remove cascade hint and the empty-key guard
- Verified: `npx vitest run apps/web/src/admin/__tests__/escalation-stage-tab.test.tsx` (4 tests), ESLint and `npm run typecheck -w @stoerdesk/web`
- Follow-up WP: WP-M14-67 (the exit criterion of the chain)
- Open question: none
