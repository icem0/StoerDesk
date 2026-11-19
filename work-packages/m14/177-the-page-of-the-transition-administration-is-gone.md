# WP-M14-177: the page of the transition administration is gone

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 12k tokens
spec: specs/07-escalation.md §7.13; PLAN.md §16
spec-lines: 40

depends-on: WP-M14-176

files-read:

- apps/web/src/admin/transition-page.tsx (the page of the old administration)
- apps/web/src/routes/index.tsx (the routes of the administration)
- apps/web/src/settings/settings-page.tsx (the menu of the settings)
- apps/web/src/admin/**tests**/transition-page.test.tsx (the test of the page)
- specs/07-escalation.md (§7.13 the steps are configuration)
- docs/REPO-MAP.md (the modules of the administration)

files-write:

- apps/web/src/admin/transition-page.tsx (deleted),
  apps/web/src/admin/**tests**/transition-page.test.tsx (deleted)
- apps/web/src/routes/index.tsx, apps/web/src/settings/settings-page.tsx
- work-packages/m14/177-the-page-of-the-transition-administration-is-gone.md,
  docs/REPO-MAP.md, PLAN.md §16, CHANGELOG.md, work-packages/README.md

interfaces:

- the route `/admin/transitions` — gone, the steps are managed in the
  escalation administration (`/admin/escalation`, the tab `Übergänge`)
- the entry `transitions` of the settings menu — gone

## Task

1. `apps/web/src/admin/transition-page.tsx` and its test are deleted: the steps
   of the workflow are managed in the escalation administration
   (WP-M14-175/176), the page of its own is gone.
2. `apps/web/src/routes/index.tsx`: the route `/admin/transitions` is gone.
3. `apps/web/src/settings/settings-page.tsx`: the entry `transitions` of the
   menu is gone.

## Non-goals

- No change of the API, of the table and of the service — the steps stay the
  state machine of the ticket.
- The texts of the deleted page stay until WP-M14-178 removes them.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; no route and no menu entry lead to the old page.

## Handoff

- Files changed: `apps/web/src/admin/transition-page.tsx` (deleted),
  `apps/web/src/admin/__tests__/transition-page.test.tsx` (deleted),
  `apps/web/src/routes/index.tsx` (the route),
  `apps/web/src/settings/settings-page.tsx` (the entry of the menu),
  `docs/REPO-MAP.md` (the row of the page), `PLAN.md` §16, `CHANGELOG.md`,
  `work-packages/README.md`, this document and the file of WP-M14-178
- Interfaces added: none — the route and the menu entry are gone
- Verified: `npm run typecheck --workspaces --if-present`, `npm run lint`,
  `npm run i18n:check` and `npm run test:run` green
- Follow-up WP: WP-M14-178 (the dead texts and the spec) — its file is created
  with this commit (`AGENTS.md`, _Open follow-ups (mandatory closure)_)
- Open question: none

- Note (rebase decision): the page of the new workflow step of WP-M14-167 sat
  below the transitions page; with the page gone the step gets created by the editor
  of the escalation administration, so the create page, its test, its route and its
  menu entry are removed as well.
