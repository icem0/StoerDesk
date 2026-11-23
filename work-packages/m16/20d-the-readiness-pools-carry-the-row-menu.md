# WP-M16-20d: the readiness pools carry the row menu

format: small-model
status: done
depends-on: WP-M16-20c
phase: 16
milestone: m16
context-budget: 16k tokens
spec: specs/13-ui.md §14.8; ADR-0043; specs/04-oncall.md §4a
spec-lines: 25

files-read:

- apps/web/src/admin/oncall-page.tsx (the pool table and the pool row)
- apps/web/src/admin/__tests__/oncall-page.test.tsx
- apps/web/src/components/row-menu.tsx (the shared menu of the row)
- apps/web/src/i18n/locales/de/oncall.json

files-write:

- apps/web/src/admin/oncall-page.tsx
- apps/web/src/admin/__tests__/oncall-page.test.tsx
- apps/web/src/i18n/locales/de/oncall.json and apps/web/src/i18n/locales/en/oncall.json

interfaces:

- the pool table of `/admin/oncall`: the column „Name“ shows the name of the
  pool, the column „Aktionen“ holds the row menu with „Bearbeiten“,
  „Aktivieren“/„Deaktivieren“ and „Löschen“
- the edit of a pool: the name and the group of the pool, opened by „Bearbeiten“

## Task

1. The pool row of `OncallPage` shows the name of the pool as text; the input
   of the name and the select of the group move into the editor, which opens
   with „Bearbeiten“ of the row menu and closes with the save.
2. The actions of the row sit behind the shared `RowMenu`: „Bearbeiten“,
   „Aktivieren“/„Deaktivieren“ and „Löschen“. The delete of a pool with shifts
   keeps its hint as the tooltip of its item and stays blocked.
3. The keys of the pool in `oncall.json` (de and en) gain `admin.pools.edit`.
4. The test proves: the row shows the name of the pool, the menu carries the
   three actions, the edit shows the name and the group and the delete of a
   pool with shifts stays blocked.

## Non-goals

- No change of the API, of the shift grid and of the warnings of the page.
- No change of the create page of a pool (`/admin/oncall/pools/new`).
- No change of the readiness of the colleagues (`/oncall`).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
npm run build
```

Expected: all green; the new test fails before the change and passes after it.

## Handoff

- Files changed: the three entries of `files-write`
- Interfaces added: `admin.pools.edit`
- Verified: the commands above
- Follow-up WP: none
- Open question: none
