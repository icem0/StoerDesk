# WP-M12-07: Settings overview page

format: small-model
status: implemented
depends-on: WP-M10-40
phase: 12
context-budget: 20k tokens
spec: PLAN.md §14 user interface; specs/13-ui.md (navigation)
spec-lines: 40

files-read:

- apps/web/src/admin/admin-home-page.tsx
- apps/web/src/settings/my-settings-page.tsx
- apps/web/src/components/Shell.tsx
- apps/web/src/routes/index.tsx
- apps/web/src/i18n/locales/de/common.json
- docs/REPO-MAP.md

files-write:

- apps/web/src/settings/settings-page.tsx
- apps/web/src/routes/index.tsx
- apps/web/src/i18n/locales/de/common.json and apps/web/src/i18n/locales/en/common.json
- apps/web/src/settings/__tests__/settings-page.test.tsx

interfaces:

- `SettingsPage` at `/settings`
- `GET /api/v1/me` (signed-in e-mail line, unchanged)

## Task

1. Add a settings overview page at `/settings` that lists every settings and
   administration destination as a link card, grouped into "Persönlich",
   "Darstellung", "Meldungen", "Objekte", "Verwaltung" and "Konto".
2. Reuse the existing `auth.links.*` labels; add only the missing
   `escalationStages` label and the group labels `appearance`/`account`.
3. Put the signed-in e-mail and the logout button on the page, replacing the
   account area the header dropdown used to carry.
4. Register the route behind `RequireSession` and cover the groups and the
   important destinations with a component test.

## Non-goals

- No change of the shell header (WP-M12-08).
- No new settings backend, no change of the existing admin pages.
- No deletion of the administration home at `/admin`.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npx vitest run apps/web/src/settings/__tests__/settings-page.test.tsx
npm run i18n:check
npm run wp:check
```

Expected: all green; the page shows every group and the destinations point at
the existing routes.

## Handoff

- Files changed: settings page, route table, de/en `common` resources, page test.
- Interfaces added: `SettingsPage` at `/settings`.
- Verified: typecheck, page test, i18n check, wp check.
- Follow-up WP: WP-M12-08 — the shell gear opens the settings page
  (`work-packages/m12/08-shell-settings-link.md` exists in this commit).
- Open question: none
