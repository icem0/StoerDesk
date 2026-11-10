# WP-M10-11: Webhook admin page and OpenAPI paths

format: small-model
status: planned
depends-on: WP-M10-10, WP-M10-06
phase: 10
milestone: m10
context-budget: 18k tokens
spec: specs/08-objects-api.md §9.5
spec-lines: 100

files-read:

- specs/08-objects-api.md (§9.5)
- apps/web/src/admin/api-keys-page.tsx
- apps/api/src/openapi.ts
- apps/web/src/routes/index.tsx

files-write:

- apps/web/src/admin/webhooks-page.tsx
- apps/web/src/routes/index.tsx
- apps/api/src/openapi.ts
- apps/web/src/i18n/de.ts / en.ts

interfaces:

- `WebhooksPage` at `/admin/webhooks`
- OpenAPI webhook paths and schemas

## Task

1. Build the webhook page with the endpoint list, create/edit form, event
   checkboxes, active switch, secret-once panel and delete confirmation.
2. Add the route and settings-menu link; hide writes without `settings.write`.
3. Extend the OpenAPI document with the webhook admin paths.
4. Add German and English strings.

## Non-goals

- No delivery-log UI.
- No retry trigger from the UI.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; a component test proves secret-once and the read-only mode.

## Handoff

- Files changed: the page, the route, the OpenAPI module and the locales
- Interfaces added: `WebhooksPage` and the webhook OpenAPI paths
- Verified: the commands above
- Follow-up WP: WP-M10-12
- Open question: none
