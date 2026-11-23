# WP-M16-15: the shared row menu and the helper of the localized name

format: small-model
status: planned
depends-on: WP-M16-14
phase: 16
milestone: m16
context-budget: 16k tokens
spec: specs/13-ui.md §14.8; ADR-0043
spec-lines: 40

files-read:

- specs/13-ui.md (§14.8)
- apps/web/src/components/notification-bell.tsx (a menu of the shell as the pattern)
- apps/web/src/i18n/locales/de/common.json and apps/web/src/i18n/locales/en/common.json
- apps/web/src/admin/text-templates-page.tsx (the first consumer of the menu)

files-write:

- apps/web/src/components/row-menu.tsx (the `…` button and its menu)
- apps/web/src/lib/localized-name.ts (the name of the set language, the record of
  the languages of an entry)
- apps/web/src/components/__tests__/row-menu.test.tsx and
  apps/web/src/lib/__tests__/localized-name.test.ts
- apps/web/src/i18n/locales/de/common.json and apps/web/src/i18n/locales/en/common.json
  (the keys of the row menu)

interfaces:

- `RowMenu({ label, items })` — the `…` button of a row; `items` are
  `{ key, label, onSelect, tone?, disabled?, title? }`, the menu closes on a click
  beside it, on `Escape` and after an action was chosen
- `localizedName(names: Record<string, string>, locale: string, fallback: string): string`
- `languageRecord(entries: Record<string, string | undefined>): Record<string, string>`
- `languagesOf(names: Record<string, string>): string[]`
- the `common` namespace, the keys `rowMenu.label` („Aktionen“ / „Actions“) and
  `rowMenu.glyph` (`…` in both)

## Task

1. `apps/web/src/lib/localized-name.ts` carries the two helpers:
   `localizedName(names, locale, fallback)` answers the text of the locale, the
   fallback `de` and then the given fallback (the machine key); `languageRecord`
   turns the flat answer of the API (`nameDe`/`nameEn`, `labelDe`/`labelEn`) into
   the record of the languages of an entry.
2. `apps/web/src/components/row-menu.tsx` carries `RowMenu`: a button with the
   glyph `…` (`common.rowMenu.glyph`), `aria-haspopup="menu"` and
   `aria-expanded`; the click opens a menu (`role="menu"`) with the items of the
   row (`role="menuitem"`). The menu closes on a click beside it (a listener on
   the document), on `Escape` and after an action was chosen. A disabled item
   keeps its reason in its `title`. The menu is `absolute` beside the button, so
   a row stays one line high.
3. `apps/web/src/i18n/locales/{de,en}/common.json` gain the keys
   `rowMenu.label` („Aktionen“ / „Actions“) and `rowMenu.glyph` (`…` in both).
4. The tests prove that the menu opens, that the actions run and close the menu,
   that a click beside it and `Escape` close it, that a disabled item does not
   run its action, and that `localizedName` answers the locale, the fallback
   `de` and the machine key.

## Non-goals

- No page uses the menu yet — the pages come with WP-M16-16 … WP-M16-20d.
- No change of the API and no change of a page of the administration.
- No own i18n namespace: the menu belongs to the `common` namespace.
- No animation and no arrow key navigation of the menu — the button and the
  items are reachable with the tab key.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
npm run build
```

Expected: all green; the new tests fail before the change (the module does not
exist) and pass after it.

## Handoff

- Files changed: the four entries of `files-write`
- Interfaces added: `RowMenu`, `localizedName`, `languageRecord`,
  `common.rowMenu.label`, `common.rowMenu.glyph`
- Verified: the commands above
- Follow-up WP: WP-M16-16, WP-M16-17, WP-M16-18, WP-M16-19, WP-M16-20a,
  WP-M16-20b, WP-M16-20c, WP-M16-20d (each file exists in the commit of the
  split)
- Open question: none
