# WP-M2-25: grouped settings menu

format: small-model
status: planned
depends-on: WP-M2-24
phase: 2
context-budget: 14k tokens
spec: PLAN.md §14 (settings menu), specs/13-ui.md (navigation)
spec-lines: 30

files-read:

- apps/web/src/components/Shell.tsx — the settings menu of the shell (WP-M1-17)
- apps/web/src/admin/admin-home-page.tsx — the `/admin` entry of WP-M2-24
- apps/web/src/i18n/locales/de/common.json — the `common` namespace

files-write:

- apps/web/src/components/Shell.tsx
- apps/web/src/i18n/locales/de/common.json
- apps/web/src/i18n/locales/en/common.json

interfaces:

- `SettingsMenu` renders its links in three labelled groups instead of one flat
  list: operations (tickets, report), objects (objects, stickers) and
  administration (`/admin`, users, roles).
- New i18n keys `common:app.settingsGroups.{operations,objects,administration}` and
  `common:auth.links.admin` (de reference, en complete).

## Task

1. `Shell.tsx`: replace the flat `navItems` array by a `navGroups` array of
   `{ key, items: { key, path }[] }`. The three groups are `operations`
   (`/tickets`, `/tickets/create`), `objects` (`/objects`, `/objects/stickers`)
   and `administration` (`/admin`, `/admin/users`, `/admin/roles`).
2. Render one `<ul>` per group with a small uppercase group caption between them,
   keeping the existing active-state styling, the `Escape`/pointer-down close
   behaviour and the 44 px hit areas of WP-M1-17.
3. Add the `/admin` link of WP-M2-24 to the administration group — the home page
   existed but was not reachable from the menu.
4. Add the group captions and the new link label to the `common` namespace in
   `de` and `en`.

## Non-goals

- No permission filtering of the menu (`usePermission` stays cosmetic, the
  server guard enforces).
- No breadcrumb, no sidebar, no persistent menu state.
- No new page and no route change.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the existing Playwright auth spec keeps passing because the
menu labels it asserts (`auth.links.*`) are unchanged.

## Handoff

- Files changed: the three files above
- Interfaces added: grouped `navGroups` in `SettingsMenu`, `app.settingsGroups.*`
  and `auth.links.admin` keys
- Verified: `npm run check` green
- Follow-up WP: WP-M2-26 (back links in the admin pages, `26-admin-back-links.md`)
- Open question: none
