# WP-M1-17: responsive shell with a settings menu

format: small-model
status: done
depends-on: WP-M1-15
phase: 1
context-budget: 18k tokens
spec: PLAN.md §14 (user interface: mobile-first, 44 px touch targets, all text via i18n)
spec-lines: 30

files-read:

- apps/web/src/components/Shell.tsx
- apps/web/src/components/app-version.tsx
- apps/web/src/auth/login-form.tsx
- apps/web/src/i18n/locales/de/common.json
- apps/web/src/i18n/locales/en/common.json
- apps/web/src/styles.css

files-write:

- apps/web/src/components/Shell.tsx
- apps/web/src/i18n/locales/de/common.json
- apps/web/src/i18n/locales/en/common.json
- apps/web/src/styles.css

interfaces:

- `Shell()`: sticky header with the title, `AppVersion` and, while signed in, a
  44 × 44 px gear button directly next to the version. The gear opens a dropdown
  containing the signed-in account, the links to `/admin/users`, `/admin/roles`
  and `/objects/stickers`, and the logout button.
- The permanent left sidebar is removed, so the main area uses the full width on
  phones and desktop. The dropdown closes on route change, on Escape and on a
  click outside; it uses `aria-expanded`/`aria-controls` and is labelled through
  the new `common:app.settings` key.
- `.shell-main > main` neutralises the page-level `<main>` wrappers (padding,
  minimum height, background) that the admin pages still render inside the shell.
- A phone-width rule makes the admin tables horizontally scrollable with a
  momentum touch scroll, so no column is clipped.

## Task

1. Replace the fixed sidebar of `Shell.tsx` with a full-width layout. Keep
   `AppVersion` outside the signed-in branch; place the gear button to its right
   only when `/me` returned a user.
2. Add the settings dropdown as a small component inside `Shell.tsx` (no new
   module, no icon library): account line, three nav links with their existing
   `common:auth.links.*` labels, active route highlight, and `LogoutButton`.
3. Add the `app.settings` key to both `common.json` files; reuse every other
   existing key.
4. Add the `.shell-main > main` reset and the phone table rule to `styles.css`.
5. Cover the menu with a component test: the gear is labelled, opens the three
   links and closes again on a second click; the build version stays visible.

## Non-goals

- No new `/settings` route and no settings API.
- No language switcher, no theme switch, no new admin forms.
- No change to the report form (`/m/:token`) or to the printable sticker sheet.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green. The gear sits next to the version, the menu opens the three
existing pages, and the shell has no fixed sidebar on a phone viewport.

## Handoff

- Files changed: `components/Shell.tsx`, both `common.json`, `styles.css`, one
  component test, `docs/REPO-MAP.md`, the backlog rows.
- Interfaces added: `common:app.settings`; no exported API changed.
- Follow-up WP: none.
- Open question: none — the settings dropdown carries only the pages that exist
  today; later settings slices (groups, standard texts, deadlines, channels, API
  keys) add their links to the same menu.
