# WP-M16-10e: the administration follows the accent — the readiness and the defaults of the tickets

format: small-model
status: done
depends-on: WP-M16-10d
phase: 16
milestone: m16
context-budget: 14k tokens
spec: specs/13-ui.md §14.4; PLAN.md §14; ADR-0036
spec-lines: 60

files-read:

- apps/web/src/admin/escalation-stage-create-page.tsx
- apps/web/src/admin/oncall-page.tsx
- apps/web/src/admin/oncall-pool-create-page.tsx
- apps/web/src/admin/ticket-defaults-page.tsx

files-write:

- apps/web/src/admin/escalation-stage-create-page.tsx
- apps/web/src/admin/oncall-page.tsx
- apps/web/src/admin/oncall-pool-create-page.tsx
- apps/web/src/admin/ticket-defaults-page.tsx

interfaces:

- the primary action of the administration pages wears the accent of the instance:
  `bg-accent-600`, `hover:bg-accent-700`, `focus-visible:ring-accent-400`

## Task

1. The pages of the readiness and the defaults of the tickets wear the accent of the instance instead of the fixed
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

- Files changed: `apps/web/src/admin/escalation-stage-create-page.tsx`,
  `apps/web/src/admin/oncall-page.tsx`,
  `apps/web/src/admin/oncall-pool-create-page.tsx`,
  `apps/web/src/admin/ticket-defaults-page.tsx`
- Interfaces added: the primary action and the links of the readiness and of the
  defaults of the tickets wear the accent of the instance (`bg-accent-600`,
  `hover:bg-accent-700`, `text-accent-300`, `focus-visible:ring-accent-400`)
- Verified: `npm run typecheck`, `npx eslint` on the changed files, the tests of
  the readiness and the defaults pages, `npm run wp:check` and `npm run test:e2e`
- Follow-up WP: the next batch of the sweep — every file exists in the commit of
  the split
- Open question: none — the WP carried the broken dependency `WP-M16-NaN`; it is
  corrected to `WP-M16-10d` in this commit.
