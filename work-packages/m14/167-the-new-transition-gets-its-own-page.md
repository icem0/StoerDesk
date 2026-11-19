# WP-M14-167: the new transition gets its own page

format: small-model
status: planned
phase: 14
milestone: m14
context-budget: 18k tokens
spec: specs/07-escalation.md §7.13; PLAN.md §16
spec-lines: 20

depends-on: WP-M14-166

files-read:

- apps/web/src/admin/transition-page.tsx (the table and the inline create form)
- apps/web/src/admin/__tests__/transition-page.test.tsx (the tests of the table)
- apps/web/src/routes/index.tsx (the routes of the administration)
- apps/web/src/i18n/locales/de/settings.json (the texts of the transitions)
- specs/07-escalation.md (§7.13 the workflow steps)
- docs/REPO-MAP.md (the module of the transition page)

files-write:

- apps/web/src/admin/transition-create-page.tsx
- apps/web/src/admin/transition-page.tsx, apps/web/src/routes/index.tsx
- apps/web/src/admin/__tests__/transition-create-page.test.tsx,
  apps/web/src/admin/__tests__/transition-page.test.tsx
- work-packages/m14/167-the-new-transition-gets-its-own-page.md,
  docs/REPO-MAP.md, PLAN.md §16, CHANGELOG.md, work-packages/README.md

interfaces:

- `TransitionCreatePage` — the own page of the new transition at
  `/admin/transitions/new`
- `/admin/transitions/new` — the route of the create page behind
  `RequireSession`

## Task

**The comment of the office (out of band in phase 14).** The input mask of the
new workflow step was glued below the table of the steps, the same way the mask
of the new status was (WP-M14-166). The mask is a page of its own now, the
table offers a button that opens it.

1. `apps/web/src/admin/transition-create-page.tsx` (new):
   `TransitionCreatePage` — the back link to the table and the form of the new
   step (the event, the target status, the event of the target). The page
   needs `settings.write`, writes with `POST /v1/admin/transitions` and
   returns to the table after a successful write.
2. `apps/web/src/admin/transition-page.tsx`: the inline create form is gone;
   the table carries the button under the heading, it leads to
   `/admin/transitions/new`. The table, the editing of a row and the removal
   stay as they are.
3. `apps/web/src/routes/index.tsx`: the route `/admin/transitions/new` behind
   `RequireSession`.
4. The tests follow: the table test expects the button as a link, a new test
   proves the form on its own page, the `POST /v1/admin/transitions` and the
   return to the table.

## Non-goals

- No change of the editing of a step: the edit form stays below the table.
- No change of the API, of the schema or of the permissions.
- No new text: the button and the heading share the key
  `admin.transition.createTitle`, the link back carries
  `admin.transition.title`.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new test proves the form on its own page and the
return to the table.

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: none — the comment of the office is closed
- Open question: none
