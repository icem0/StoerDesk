# WP-M14-02: The administration pages lead back to the settings menu

format: small-model
status: done
depends-on: WP-M14-01
phase: 14
milestone: m14
context-budget: 18k tokens
spec: PLAN.md §14, §16, §17
spec-lines: 40

files-read:

- apps/web/src/admin/users-page.tsx
- apps/web/src/admin/oncall-page.tsx
- apps/web/src/settings/branding-page.tsx
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/de/common.json
- apps/web/src/i18n/locales/de/oncall.json

files-write:

- apps/web/src/admin/users-page.tsx, apps/web/src/admin/roles-page.tsx, apps/web/src/admin/groups-page.tsx, apps/web/src/admin/detected-errors-page.tsx
- apps/web/src/admin/text-templates-page.tsx, apps/web/src/admin/bma-sync-page.tsx, apps/web/src/admin/api-keys-page.tsx, apps/web/src/admin/webhooks-page.tsx
- apps/web/src/admin/dashboard-settings-page.tsx, apps/web/src/admin/oncall-page.tsx, apps/web/src/settings/branding-page.tsx, apps/web/src/settings/my-settings-page.tsx
- apps/web/src/i18n/locales/de/common.json, apps/web/src/i18n/locales/en/common.json, apps/web/src/i18n/locales/de/settings.json, apps/web/src/i18n/locales/en/settings.json, apps/web/src/i18n/locales/de/oncall.json, apps/web/src/i18n/locales/en/oncall.json

interfaces:

- the back link of every administration and settings page → `/settings`

## Task

1. Every administration page and every settings page that carries a back link
   points to `/settings` instead of `/admin`: the address of the removed
   administration home is not a destination any more.
2. The three back-link texts — `settings:admin.back`, `common:branding.back`
   and `oncall:admin.back` — say "Zurück zu den Einstellungen" /
   "Back to settings" in `de` and `en`.
3. The tests of the users page and of the roles page expect the new text.

## Non-goals

- No new component, no change of the layout of a page.
- No change of the escalation page — it has no back link today and gets none.
- No change of the permissions or of the routes.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; no page of the web app links to `/admin` any more and the
three back-link texts name the settings menu.

## Handoff

- Files changed: the twelve pages with a back link, the three locale namespaces
  of the back-link text, the two page tests
- Interfaces added: none
- Verified: `npm run check`, `npm run build`
- Follow-up WP: WP-M14-03 — the messenger channels: specification, ADR and the
  split of the rest of the phase
- Open question: none
