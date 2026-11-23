# WP-M16-10d: the administration follows the accent — the escalation

format: small-model
status: done
depends-on: WP-M16-10c
phase: 16
milestone: m16
context-budget: 14k tokens
spec: specs/13-ui.md §14.4; PLAN.md §14; ADR-0036
spec-lines: 60

files-read:

- apps/web/src/admin/escalation-page.tsx
- apps/web/src/admin/escalation-action-editor.tsx
- apps/web/src/admin/escalation-condition-builder.tsx

files-write:

- apps/web/src/admin/escalation-page.tsx
- apps/web/src/admin/escalation-action-editor.tsx
- apps/web/src/admin/escalation-condition-builder.tsx

interfaces:

- the primary action of the administration pages wears the accent of the instance:
  `bg-accent-600`, `hover:bg-accent-700`, `focus-visible:ring-accent-400`

## Task

1. The pages of the escalation wear the accent of the instance instead of the fixed
   blue of the build: the primary buttons become `bg-accent-600 text-white
   hover:bg-accent-700`, the focus rings become `focus-visible:ring-accent-400`
   and the links of a page become `text-accent-300`.
2. The semantic colours stay: the states of a ticket, of a channel and of a
   readiness keep their emerald, rose and amber — they carry a meaning and not
   a brand (ADR-0036).

## Non-goals

- No change of the contract, of the API, of the texts and of the behaviour.
- No change of the destructive actions.
- No change of the other administration pages — the other batches of the sweep
  carry them.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the existing tests of the pages stay green.

## Handoff

- Files changed: `apps/web/src/admin/escalation-page.tsx`,
  `apps/web/src/admin/escalation-action-editor.tsx`,
  `apps/web/src/admin/escalation-condition-builder.tsx`
- Interfaces added: the primary action and the tabs of the escalation
  administration wear the accent of the instance (`bg-accent-600`,
  `hover:bg-accent-700`, `bg-accent-700`, `focus-visible:ring-accent-400`), the
  secondary add buttons keep their slate and take the accent ring
- Verified: `npm run typecheck`, `npx eslint` on the changed files,
  `npm run test:run -- apps/web/src/admin/__tests__/escalation-page-fallbacks.test.tsx
  apps/web/src/admin/__tests__/escalation-stage-tab.test.tsx
  apps/web/src/admin/__tests__/escalation-rules-editor.test.tsx
  apps/web/src/admin/__tests__/escalation-actions-editor.test.tsx
  apps/web/src/admin/__tests__/escalation-page-localization.test.tsx` and
  `npm run wp:check`
- Follow-up WP: the next batch of the sweep — every file exists in the commit of
  the split
- Open question: none — the WP named `apps/web/src/admin/transition-create-page.tsx`
  and the dependency `WP-M16-NaN`; the page of the transition administration was
  removed with the transition table (ADR-0041, WP-M14-177), so the file list and
  the dependency were corrected in this commit.
