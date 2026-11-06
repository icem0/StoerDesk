# WP-M2-96: admin shell navigation links for groups, bma-sync and text-templates

format: small-model
status: planned
depends-on: WP-M2-94b (name fields in the users page UI)
phase: 2
context-budget: 14k tokens
spec: PLAN.md §14 (internal UI: settings users, groups, standard texts), PLAN.md §16 (administration home modules)
spec-lines: 10

files-read:

- apps/web/src/components/Shell.tsx — navGroups administration items
- apps/web/src/i18n/locales/de/common.json — auth.links keys
- apps/web/src/i18n/locales/en/common.json — auth.links keys
- apps/web/src/routes/index.tsx — route table confirms /admin/groups, /admin/bma-sync, /admin/text-templates exist
- apps/web/src/admin/admin-home-page.tsx — MODULES lists groups, bmaSync, standardTexts as available

files-write:

- apps/web/src/components/Shell.tsx — add groups, bmaSync, standardTexts to the administration nav group
- apps/web/src/i18n/locales/de/common.json — auth.links.groups, auth.links.bmaSync, auth.links.standardTexts
- apps/web/src/i18n/locales/en/common.json — auth.links.groups, auth.links.bmaSync, auth.links.standardTexts

interfaces:

- Shell nav item `{ key: 'groups', path: '/admin/groups' }` rendered as `t('auth.links.groups')`
- Shell nav item `{ key: 'bmaSync', path: '/admin/bma-sync' }` rendered as `t('auth.links.bmaSync')`
- Shell nav item `{ key: 'standardTexts', path: '/admin/text-templates' }` rendered as `t('auth.links.standardTexts')`

## Task

1. `Shell.tsx`: append `groups`, `bmaSync`, `standardTexts` to the `administration` nav group, after `branding`, so all existing admin pages are reachable from the settings menu.
2. `de`/`en` `common.json`: add `auth.links.groups` = „Gruppen“/„Groups“, `auth.links.bmaSync` = „BMAcloud-Abgleich“/„BMAcloud sync“, `auth.links.standardTexts` = „Störungsarten“/„Fault types“.

## Non-goals

- No new routes or pages — all three targets already exist.
- No permission changes — the pages enforce their own guards; the shell only links.
- No changes to the planned modules (deadlines, oncall, channels, apiKeys) — they correctly stay out of the shell.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
npm run build
```

Expected: all green; i18n key parity de/en; every key referenced in `apps/web/src` exists.

## Handoff

- Files changed: `apps/web/src/components/Shell.tsx`, `apps/web/src/i18n/locales/de/common.json`, `apps/web/src/i18n/locales/en/common.json`
- Interfaces added: three administration nav links in the settings menu
- Follow-up WP: none
- Open question: none
