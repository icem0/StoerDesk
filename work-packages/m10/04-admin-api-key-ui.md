# WP-M10-04: Admin API-key page

format: small-model
status: planned
depends-on: WP-M10-03
phase: 10
milestone: m10
context-budget: 18k tokens
spec: specs/08-objects-api.md §9.5
spec-lines: 80

files-read:

- specs/08-objects-api.md (§9.5)
- apps/web/src/admin/dashboard-settings-page.tsx (page pattern)
- apps/web/src/routes/index.tsx
- apps/web/src/i18n/de.ts or the active locale module

files-write:

- apps/web/src/admin/api-keys-page.tsx
- apps/web/src/routes/index.tsx
- apps/web/src/i18n/de.ts
- apps/web/src/i18n/en.ts

interfaces:

- `ApiKeysPage` at `/admin/api-keys`
- create dialog showing the token exactly once, scope checkboxes, revoke action

## Task

1. Build `ApiKeysPage` with the list, create form, scope checkboxes, optional
   expiry, inline errors, the one-time token panel and a revoke confirmation.
2. Hide write actions without `apikey.write`; read-only mode keeps the list.
3. Add the route and the settings-menu link.
4. Add the German and English strings.

## Non-goals

- No external API consumer UI.
- No webhook UI.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; a component test proves the token appears only after
creation and disappears after closing the panel.

## Handoff

- Files changed: the page, the route and both locale modules
- Interfaces added: `ApiKeysPage`
- Verified: the commands above
- Follow-up WP: none
- Open question: none
