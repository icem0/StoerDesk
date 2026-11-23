# WP-M16-22: the row menu escapes the scroll container

format: small-model
status: done
depends-on: WP-M16-21
phase: 16
milestone: m16
context-budget: 12k tokens
spec: specs/13-ui.md §14.8; ADR-0043
spec-lines: 20

files-read:

- apps/web/src/components/row-menu.tsx (the menu of the row)
- apps/web/src/components/__tests__/row-menu.test.tsx
- apps/web/src/admin/text-templates-page.tsx (the list with the scroll container)

files-write:

- apps/web/src/components/row-menu.tsx (the menu hangs in the body of the document)
- apps/web/src/components/__tests__/row-menu.test.tsx
- work-packages/m16/22-the-row-menu-escapes-the-scroll-container.md (this
  document) and work-packages/README.md (the backlog row)
- CHANGELOG.md and docs/REPO-MAP.md

interfaces:

- the menu of a row hangs in the body of the document (`createPortal`) and
  positions itself over the button (`position: fixed`)
- the menu opens upwards when there is no room below the button and follows the
  button while the page scrolls

## Task

The menu of the row was absolutely positioned inside the row. A table in a
scroll container (`overflow-x-auto`) clips it: the menu of the **last** row of
the fault types was cut off after a few pixels — the admin had to scroll to
see the actions of the last entry.

1. `RowMenu` renders the menu with `createPortal` into the body of the document
   and positions it over the button with `position: fixed`; no ancestor of the
   page can clip it any more.
2. The menu opens **upwards** when there is no room below the button
   (`window.innerHeight`), so the menu of the last row of a list is fully
   visible.
3. The menu **follows the button** while the page scrolls and while the window
   changes its size — it repositions itself instead of closing, so a scroll
   right after the click does not swallow the menu.
4. The test proves that the menu hangs in the body of the document.

## Non-goals

- No change of the actions of a row and of the pages that use the menu.
- No change of the API and no change of the texts.
- No own i18n key.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
npm run build
```

Expected: all green; the new test fails before the change (the menu hangs in
the row) and passes after it.

## Handoff

- Files changed: the four entries of `files-write`
- Interfaces added: the portal of the menu and its placement
- Verified: the commands above; a screenshot of the last row of the fault types
  shows the menu completely
- Follow-up WP: none
- Open question: none
