# WP-M36-03: an entry of the settings menu shows its name alone

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
- apps/web/src/settings/settings-page.tsx (the entry carries the text of the panel)
- apps/web/src/i18n/locales/de/common.json (the group `app.settingsItemDescriptions` is gone)
- apps/web/src/i18n/locales/en/common.json
- apps/web/src/i18n/locales/de/help.json
- apps/web/src/i18n/locales/en/help.json
- apps/web/src/settings/__tests__/settings-menu.test.tsx
- apps/web/src/settings/__tests__/settings-page.test.tsx

interfaces:

- `SettingsMenuItem` gains `helpText` (the text of the panel) — the former `description` is gone
- `help.settingsMenu.<key>More` — the explanation of the entry
- `help.triggerFor` — the accessible name of the ⓘ: „Erklärung zu {{name}}“

## Task

The menu of the settings is the place the office meant by „die Erklárungen
sollen alle in ein mouseover gepackt werden falls sie im Menü sind“ — and it is
the place the office is allowed to keep a readable line, because the menu is
what makes the list manageable (§14.10).

1. **The entry becomes a row.** `SettingsMenuEntry` renders the entry inside the
   list item as a row: the symbol and the name carry the link, and an ⓘ button
   sits **beside** them as a sibling. A `<button>` inside the `<a>` of the entry
   is invalid markup and unreachable — the current markup wrapped everything
   into the link (`settings-menu.tsx:136`), so the fix is structural.
2. **The name alone.** The description under the name is **gone** — the office
   asked for prägnante Namen and for the explanation in the mouse-over
   („nicht zusätzliche infos“). Because the line is short now, the name is
   **bigger** than the text of the rest of the interface (`text-base`, the
   symbol `h-6`).
3. **The ⓘ names its entry.** The accessible name of the button is „Erklärung zu
   {{name}}“ (`help.triggerFor`), so a screen reader reads a list of 23
   different buttons instead of 23 identical ones.
4. **The search stays honest.** The filter matches the name **and** the text of
   the panel: an explanation the user cannot see is no explanation for the
   search.
5. **The texts.** The explanations live in the namespace `help` under
   `help.settingsMenu.<key>More` — one per entry, in `de` and in `en`. The old
   group `app.settingsItemDescriptions` in `common.json` is deleted: the menu
   shows no text twice.
6. **The test** proves: every entry shows symbol and name; **no description
   stands under the name**; the name is bigger; the panel of an entry opens on
   click and on keyboard; the ⓘ sits **beside** the link and never inside it
   and carries the name of its entry; a search term that only matches the panel
   text still finds the entry; no section folds away and every path of the
   administration is still in the menu (WP-M29-06 stays satisfied).

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
  explanations and `triggerFor`),
  `apps/web/src/settings/__tests__/settings-menu.test.tsx`
- Interfaces added: `SettingsMenuItem.helpText`, `help.settingsMenu.<key>More`,
  `help.triggerFor`
- Verified: `npm run check:static`, the 8 cases of the menu test, the tests of
  the folder `apps/web/src/settings`
- Follow-up WP: WP-M36-04 (the page-level ⓘ of the shell)
- Open question: none
- Notes: the amendment of ADR-0060 (2026-11-25) is the correction of the
  office: the menu shows **the name alone**, the description under the name is
  gone and the whole explanation opens in the panel of the ⓘ. The one-liners
  that stood under the names (`app.settingsItemDescriptions`) were deleted with
  the group — the search finds the entry through the text of the panel.
