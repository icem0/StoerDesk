# WP-M16-20c: the webhooks and the API keys carry the row menu

format: small-model
status: planned
depends-on: WP-M16-20b
phase: 16
milestone: m16
context-budget: 14k tokens
spec: specs/13-ui.md §14.8; ADR-0043
spec-lines: 20

files-read:

- apps/web/src/admin/webhooks-page.tsx
- apps/web/src/admin/api-keys-page.tsx
- apps/web/src/admin/__tests__/webhooks-page.test.tsx and
  apps/web/src/admin/__tests__/api-keys-page.test.tsx
- apps/web/src/components/row-menu.tsx (the shared menu of the row)

files-write:

- apps/web/src/admin/webhooks-page.tsx
- apps/web/src/admin/api-keys-page.tsx
- apps/web/src/admin/__tests__/webhooks-page.test.tsx and
  apps/web/src/admin/__tests__/api-keys-page.test.tsx

interfaces:

- the webhook list of `/admin/webhooks`: the actions of a row sit behind the
  row menu with „Bearbeiten“ and „Löschen“
- the API key list of `/admin/api-keys`: the actions of a row sit behind the
  row menu with „Widerrufen“

## Task

1. The webhook row of `WebhooksPage` replaces its two buttons with the shared
   `RowMenu`: „Bearbeiten“ opens the form of the webhook, „Löschen“ asks for
   the confirmation (the `confirming` state of the row stays).
2. The API key row of `ApiKeysPage` replaces its button with the shared
   `RowMenu`: „Widerrufen“ asks for the confirmation (the `confirming` state of
   the row stays). A revoked key keeps its note instead of a menu.
3. The tests prove: the menu of a row carries the actions, an action asks for
   the confirmation and a revoked key keeps its note.

## Non-goals

- No change of the API, of the secret of a webhook and of the token of an API
  key — the token is shown once and never listed again.
- No change of the create pages (`/admin/webhooks/new`, `/admin/api-keys/new`).
- No change of the delivery problems (`/admin/delivery`).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
npm run build
```

Expected: all green; the new tests fail before the change and pass after it.

## Handoff

- Files changed: the four entries of `files-write`
- Interfaces added: none — the row menu of WP-M16-15 is used
- Verified: the commands above
- Follow-up WP: WP-M16-20d (its file exists in the commit of the split)
- Open question: none
