# WP-M2-40c: fault type administration UI

format: small-model
status: done
depends-on: WP-M2-40b
phase: 2
context-budget: 16k tokens
spec: specs/06-report-form.md §7.9, specs/02-data-model.md §4.5
spec-lines: 40

files-read:

- specs/06-report-form.md §7.9
- apps/web/src/admin/roles-page.tsx — table/form/permission/error style
- apps/web/src/settings/branding-page.tsx — mutation and permission style
- apps/web/src/routes/index.tsx — route registration
- apps/web/src/i18n/locales/de/settings.json — the admin namespace

files-write:

- apps/web/src/admin/text-templates-page.tsx
- apps/web/src/routes/index.tsx
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json

interfaces:

- `TextTemplatesPage` at `/admin/text-templates` behind `RequireSession`
- table: key, German text, English text, active/archived, usage count and
  edit/archive/reactivate/delete actions
- create and edit forms carry the complete `de`/`en` pair; delete is disabled
  while `usageCount > 0`
- settings keys `admin.textTemplates.*` in de and en

## Task

1. Build `TextTemplatesPage` on `/v1/text-templates`: list with `settings.read`,
   create/edit/archive/reactivate/delete with `settings.write`, `useMe` and
   `usePermission` exactly like the roles page.
2. Register the page at `/admin/text-templates` inside the `RequireSession`
   branch of the router.
3. Add the de/en fixtures; rename the administration-home module text from
   "Standardtexte" to "Störungsarten"/"Fault types". No literal JSX text.
4. Show `deleteBlocked` when a template has `usageCount > 0`; the API remains
   the enforcement point, and the server error is mapped for every handled code.

## Non-goals

- No link from the administration home (WP-M2-40d).
- No report-form or ticket-detail change (WP-M2-40e/40f).
- No new component test; the API integration test of WP-M2-40b covers the rules.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run i18n:check
npm run wp:check
```

Expected: all green; the route renders the three action groups for a role with
`settings.write`.

## Handoff

- Files changed: the page, the router, both locale files
- Interfaces added: `TextTemplatesPage`, `admin.textTemplates.*`
- Verified: `npm run typecheck`, `npm run lint`, `npm run i18n:check` (465 keys de and en)
- Follow-up WP: WP-M2-40d (administration-home entry)
- Open question: none
