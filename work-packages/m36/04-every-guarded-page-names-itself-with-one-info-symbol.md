# WP-M36-04: every guarded page names itself with one info symbol

format: ctx-256k
status: done
depends-on: WP-M36-02
phase: 36
milestone: m36
context-budget: 50k tokens
spec: specs/13-ui.md §14.3, §14.6, §14.13; PLAN.md §14
spec-lines: 160
changed-lines: 320

files-read:

- specs/13-ui.md (§14.3 the shell, §14.6 the shell on a phone, §14.13)
- docs/DECISIONS/0060-an-explanation-of-a-place-is-a-help-popover.md
- apps/web/src/components/Shell.tsx
- apps/web/src/components/notification-bell.tsx
- apps/web/src/components/app-version.tsx
- apps/web/src/features/notifications/web-push-help-page.tsx
- apps/web/src/settings/notifications-page.tsx
- apps/web/src/components/__tests__/shell.test.tsx
- apps/web/src/i18n/locales/de/common.json
- apps/web/src/i18n/locales/en/common.json

files-write:

- apps/web/src/components/Shell.tsx
- apps/web/src/components/page-help.tsx (the ⓘ of the page)
- apps/web/src/components/page-help-map.ts (the route map and the routes that explain themselves)
- apps/web/src/components/notification-bell.tsx
- apps/web/src/i18n/locales/de/help.json (`help.page.<route>`)
- apps/web/src/i18n/locales/en/help.json
- apps/web/src/components/__tests__/page-help.test.tsx

interfaces:

- `pageHelpKey(pathname)` — the key of the explanation of the page, `null` when the page explains itself
- `PageHelp` — the ⓘ of the page, rendered by the shell beside the version
- the text of the page-level ⓘ is static in the web build (`help.page.<route>`)

## Task

„bei Erklárungen auf einer Seite ohne einen link auf den man ein mouseover
legen kann soll ein info symbol sein … auf jeder Seite eigentlich“ — and the
exception „es sei denn es ist perse eine info seite oder hilfe seite“.

1. **`apps/web/src/components/page-help-map.ts`**: the map of the guarded pages to
   their key (`help.page.tickets`, `help.page.stats`, `help.page.oncall`,
   `help.page.settings`, `help.page.objects`, the admin pages …), matched by
   route prefix — the longest route wins, so `/admin/users/new` inherits the
   explanation of `/admin/users` — and the list of the routes that **explain
   themselves** — `web-push-help-page.tsx` and the overview of the own channels
   `/settings/notifications` — where no ⓘ is rendered.
2. **The shell renders one ⓘ** next to the version (`Shell.tsx:149`), as a
   button of at least 44 px with the accent focus ring. Its panel says what the
   page is for and what the user does there. The settings gear keeps its link,
   but its `title=` (`Shell.tsx:87`) is gone — the accessible name of the link
   is enough; the same for the bell (`notification-bell.tsx:51`).
3. **The phone stays a phone.** The ⓘ sits in the identity row, not in the tab
   strip; the strip keeps its 44 px tabs and its horizontal scroll only (§14.6).
4. **The texts**: `help.page.<route>` in `de` and `en` — every guarded route has
   both. The public surfaces (the report form `/m/:token`, the status page
   `/s/:token`) are outside the shell and keep their own visible prose: the 112
   notice (§2) and the flow of the one-hand form stay visible, and no symbol
   replaces them.
5. **The test**: every guarded page renders exactly one ⓘ; a page that explains
   itself renders none; the panel of the ticket list names the open default of
   WP-M35-03 and the filter menu; the header menu keeps its visible labels and
   carries no ⓘ.

## Non-goals

- No report form, no status page — both are public and outside the shell.
- No change of the alarm band, of the setup warning band or of the unread badge.
- No instance-editable help text — the help of a page belongs to the build.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new cases of the shell test fail before the change.

## Handoff

- Files changed: `apps/web/src/components/Shell.tsx`,
  `apps/web/src/components/page-help.tsx` (new),
  `apps/web/src/components/page-help-map.ts` (new),
  `apps/web/src/components/notification-bell.tsx`,
  `apps/web/src/i18n/locales/de/help.json` and `.../en/help.json` (the 31
  explanations of the pages),
  `apps/web/src/components/__tests__/page-help.test.tsx` (new)
- Interfaces added: `pageHelpKey(pathname)`, `PageHelp`, `help.page.<route>`
- Verified: `npm run check:static`, the 8 cases of the new test, the 83 cases
  of the tests of the folder `apps/web/src/components`
- Follow-up WP: WP-M36-05 (the administration names its keys in a panel)
- Open question: none
- Notes: the map lives in its own module, so the component file exports only
  the component and the lint rule of the fast refresh stays quiet; the test
  proves that every key of the map exists in both languages — a typo in the map
  would otherwise show the key itself.
