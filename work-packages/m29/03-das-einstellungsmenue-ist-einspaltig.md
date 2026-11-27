# WP-M29-03: the settings menu is single-column

format: ctx-256k
status: done
depends-on: WP-M29-02
phase: 29
milestone: m29
context-budget: 48k tokens
spec: specs/13-ui.md §14.10; PLAN.md §14
spec-lines: 90
changed-lines: 650

files-read:

- specs/13-ui.md §14.10 (the menu of the settings)
- PLAN.md §14 (user interface)
- apps/web/src/settings/settings-page.tsx (today's two-column menu)
- apps/web/src/settings/__tests__/settings-page.test.tsx (today's assertions)
- apps/web/src/i18n/locales/de/common.json, apps/web/src/i18n/locales/en/common.json (auth.links.*)
- apps/web/src/components/icon.tsx (the symbols of WP-M29-02)

files-write:

- apps/web/src/settings/settings-menu.tsx (new)
- apps/web/src/settings/settings-page.tsx
- apps/web/src/settings/__tests__/settings-menu.test.tsx (new)
- apps/web/src/settings/__tests__/settings-page.test.tsx
- apps/web/src/i18n/locales/de/common.json
- apps/web/src/i18n/locales/en/common.json

interfaces:

- `SettingsMenu({ sections })` — one column: every entry wears its symbol, a label and a short description; a search field filters label and description; every section stays visible (WP-M29-11); nothing matches shows „Keine Einstellung gefunden“
- `GET /settings` — groups „Mein Bereich“, „Darstellung“, „Objekte“, „Verwaltung“ (topic pages) and „Konto“; the work surfaces and the duplicate readiness entry leave the menu

## Task

1. `apps/web/src/settings/settings-menu.tsx`: the shared one-column menu component. A section is a heading (optionally with a symbol) and a list of entries — a section does not fold away (WP-M29-11); an entry is a `NavLink` row (or an action row with `onClick`) with symbol, label and description, `min-h-11`, the accent active state, `aria-current` on the open page. The component owns the search field (label, placeholder) and the empty state.
2. `apps/web/src/settings/settings-page.tsx`: uses `SettingsMenu` with the groups „Mein Bereich“ (Meine Einstellungen, Benachrichtigungen), „Darstellung“ (Darstellung & Logo, Dashboard & TV), „Objekte“ (Objekte, QR-Aufkleber, Sticker-Vorlage), „Verwaltung“ (the four topic pages of WP-M29-04 as links) and „Konto“ (Abmelden as today). The operations group (Meldungen, Statistik, „Neue Störung melden“) and „Meine Bereitschaft“ leave the menu — they live in the header menu and on `/oncall`. The alarm-tone button (WP-M25-09) and the delivery-problems badge stay above the groups. The labels and descriptions move from `auth.links.*` to `app.settingsItems.*`; `auth.links.*` is deleted from the locales.
3. `apps/web/src/i18n/locales/de/common.json` and `.../en/common.json`: the group names, the item labels and descriptions, the search label/placeholder and the empty state; `auth.links.*` removed (24 keys per language).
4. `apps/web/src/settings/__tests__/settings-menu.test.tsx`: search filters by label and description, every section stays visible, every entry renders its symbol `aria-hidden`.
5. `apps/web/src/settings/__tests__/settings-page.test.tsx`: rewritten for the new groups, the topic-page hrefs, the icons and the search field.

## Non-goals

- The topic pages themselves (WP-M29-04) — the menu only links to them.
- The alarm tone and the delivery badge keep their today's behaviour.
- The LogoutButton keeps its today's look and its component.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the rewritten settings-page test fails before the change and passes after it.

## Handoff

- Files changed: `settings-menu.tsx`, `settings-page.tsx`, `settings-menu.test.tsx`, `settings-page.test.tsx`, `de/common.json`, `en/common.json`
- Interfaces added: `SettingsMenu`
- Verified: the commands above
- Follow-up WP: WP-M29-04 (the topic pages linked from „Verwaltung“)
- Open question: none
