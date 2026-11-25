# WP-M36-03: an entry of the settings menu keeps its summary visible

format: ctx-256k
status: done
depends-on: WP-M36-02
phase: 36
milestone: m36
context-budget: 50k tokens
spec: specs/13-ui.md §14.10, §14.13; PLAN.md §14
spec-lines: 160
changed-lines: 300

files-read:

- specs/13-ui.md (§14.10 the menu of the settings, §14.13 the explanation of a place)
- docs/DECISIONS/0060-an-explanation-of-a-place-is-a-help-popover.md
- apps/web/src/settings/settings-menu.tsx
- apps/web/src/settings/settings-page.tsx
- apps/web/src/components/help-popover.tsx
- apps/web/src/components/icon.tsx
- apps/web/src/i18n/locales/de/common.json
- apps/web/src/i18n/locales/en/common.json
- apps/web/src/settings/__tests__/settings-menu.test.tsx

files-write:

- apps/web/src/settings/settings-menu.tsx (the entry is a row, not a wrapping link)
- apps/web/src/settings/settings-page.tsx (the entry carries summary and panel text)
- apps/web/src/i18n/locales/de/common.json (the group `app.settingsItemDescriptions` is gone)
- apps/web/src/i18n/locales/en/common.json
- apps/web/src/i18n/locales/de/help.json
- apps/web/src/i18n/locales/en/help.json
- apps/web/src/settings/__tests__/settings-menu.test.tsx
- apps/web/src/settings/__tests__/settings-page.test.tsx

interfaces:

- `SettingsMenuItem` gains `summary` (the visible line) and `helpText` (the panel body) beside the former `description`
- `help.settingsMenu.<key>` — the summary that stays visible
- `help.settingsMenu.<key>More` — the panel body of the entry

## Task

The menu of the settings is the place the office meant by „die Erklárungen
sollen alle in ein mouseover gepackt werden falls sie im Menü sind“ — and it is
the place the office is allowed to keep a readable line, because the menu is
what makes the list manageable (§14.10).

1. **The entry becomes a row.** `SettingsMenuEntry` renders the entry inside the
   list item as a row: the symbol and the label carry the link, and an ⓘ button
   sits **beside** them as a sibling. A `<button>` inside the `<a>` of the entry
   is invalid markup and unreachable — the current markup wrapped everything
   into the link (`settings-menu.tsx:136`), so the fix is structural.
2. **Two tiers.** The label and the **summary** stay visible; the panel behind
   the ⓘ holds the full explanation. The visible summary is one line and moves
   from `text-xs text-slate-500` to `text-sm text-slate-300`, so the entry
   stays scannable and readable.
3. **The search stays honest.** The filter matches label, summary **and** the
   panel body: an explanation the user cannot see is no explanation for the
   search.
4. **The texts.** Both tiers live in the namespace `help`: the visible summary
   under `help.settingsMenu.<key>` (the one-liners of today) and the panel body
   under `help.settingsMenu.<key>More` (the full explanation of the place).
   All 23 entries have both in `de` and in `en`. The old group
   `app.settingsItemDescriptions` in `common.json` is deleted — the menu shows
   no text twice.
5. **The test** proves: every entry shows symbol, label and summary; the panel
   of an entry opens on click and on keyboard; the ⓘ sits **beside** the link
   and never inside it; a search term that only matches the panel body still
   finds the entry; no section folds away and every path of the administration
   is still in the menu (WP-M29-06 stays satisfied).

## Non-goals

- No page-level ⓘ — that is WP-M36-04.
- No change of the groups, of the order of the entries or of the search field
  itself (§14.10, WP-M29-03).
- No change of the admin pages the menu links to.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new cases of the menu test fail before the change.

## Handoff

- Files changed: `apps/web/src/settings/settings-menu.tsx`,
  `apps/web/src/settings/settings-page.tsx`,
  `apps/web/src/i18n/locales/de/common.json` and `.../en/common.json` (the group
  `app.settingsItemDescriptions` is gone),
  `apps/web/src/i18n/locales/de/help.json` and `.../en/help.json` (the 23
  summaries and the 23 panel bodies),
  `apps/web/src/settings/__tests__/settings-menu.test.tsx`
- Interfaces added: `SettingsMenuItem.summary` and `SettingsMenuItem.helpText`,
  `help.settingsMenu.<key>` and `help.settingsMenu.<key>More`
- Verified: `npm run check:static`, the 5 cases of the menu test, the 49 cases
  of the tests of the folder `apps/web/src/settings`
- Follow-up WP: WP-M36-04 (the page-level ⓘ of the shell)
- Open question: none
- Notes: the summary moved from `text-xs text-slate-500` (the smallest and
  weakest text of the interface) to `text-sm text-slate-300` and wraps instead
  of being cut off — the readability of the menu rises with the panel behind it.
