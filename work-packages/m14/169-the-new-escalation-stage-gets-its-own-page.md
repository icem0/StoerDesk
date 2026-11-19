# WP-M14-169: the new escalation stage gets its own page

format: small-model
status: planned
phase: 14
milestone: m14
context-budget: 20k tokens
spec: specs/07-escalation.md §7.9; PLAN.md §16
spec-lines: 20

depends-on: WP-M14-168

files-read:

- apps/web/src/admin/escalation-page.tsx (the stage tab and its inline create form)
- apps/web/src/admin/__tests__/escalation-stage-tab.test.tsx (the tests of the tab)
- apps/web/src/routes/index.tsx (the routes of the administration)
- apps/web/src/i18n/locales/de/settings.json (the texts of the escalation)
- specs/07-escalation.md (§7.9 the stages of the chain)
- docs/REPO-MAP.md (the module of the escalation page)

files-write:

- apps/web/src/admin/escalation-stage-create-page.tsx
- apps/web/src/admin/escalation-page.tsx, apps/web/src/routes/index.tsx
- apps/web/src/admin/__tests__/escalation-stage-create-page.test.tsx
- work-packages/m14/169-the-new-escalation-stage-gets-its-own-page.md,
  docs/REPO-MAP.md, PLAN.md §16, CHANGELOG.md, work-packages/README.md

interfaces:

- `EscalationStageCreatePage` — the own page of the new escalation stage at
  `/admin/escalation/stages/new`
- `/admin/escalation/stages/new` — the route of the create page behind
  `RequireSession`

## Task

**The comment of the office (out of band in phase 14).** The input mask of the
new escalation stage was glued below the list of the stages of the chain, the
same way the mask of the new readiness pool was (WP-M14-168). The mask is a page
of its own now, the list offers a button that opens it.

1. `apps/web/src/admin/escalation-stage-create-page.tsx` (new):
   `EscalationStageCreatePage` — the back link to the escalation administration
   and the form of a new stage (the name, the predecessor, the deadline of the
   stage). The page needs `settings.write`, writes with
   `POST /v1/escalation/stages` and returns to the administration after a
   successful write.
2. `apps/web/src/admin/escalation-page.tsx`: the inline create form is gone;
   the stage tab carries the button, it leads to
   `/admin/escalation/stages/new`. The chain, the rules, the action editor and
   the settings stay as they are.
3. `apps/web/src/routes/index.tsx`: the route `/admin/escalation/stages/new`
   behind `RequireSession`.
4. The tests follow: a new test proves the form on its own page, the
   `POST /v1/escalation/stages` and the return to the administration.

## Non-goals

- No change of the rules, of the actions and of the editor of the chain.
- No change of the API, of the schema or of the permissions.
- No new text: the button and the heading share the key of the stage form, the
  link back carries the title of the escalation administration.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new test proves the form on its own page and the
return to the administration.

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: none — the comment of the office is closed
- Open question: none
