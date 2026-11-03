# WP-M2-40b: fault template admin and public catalog API

format: small-model
status: done
depends-on: WP-M2-40
phase: 2
context-budget: 18k tokens
spec: specs/06-report-form.md §7.9, specs/02-data-model.md §4.5
spec-lines: 55

files-read:

- specs/06-report-form.md §7.9
- specs/02-data-model.md §4.5
- apps/api/src/settings/branding.ts — the route/guard/error style
- apps/api/src/admin/users.ts — the transaction and error style
- apps/api/src/settings/__tests__/branding.integration.spec.ts — the test setup
- apps/api/src/index.ts — route registration

files-write:

- apps/api/src/settings/text-templates.ts
- apps/api/src/index.ts
- apps/api/src/settings/__tests__/textTemplates.integration.spec.ts
- packages/shared/src/schemas/ticket.ts

interfaces:

- `GET /api/v1/text-templates` — `settings.read`, all templates with translations
  and `usageCount`
- `POST /api/v1/text-templates` — `settings.write`, generated key `custom.<uuid>`
- `PATCH /api/v1/text-templates/:id` — `settings.write`, translations and/or
  `archived`
- `DELETE /api/v1/text-templates/:id` — `settings.write`, `409
  text_template_in_use` while a ticket carries the key
- `GET /api/v1/public/text-templates?locale=de|en` — unauthenticated, active only
- shared `faultTemplateKeySchema` imports `textTemplateKeySchema` so the ticket
  request and the catalog share one key rule

## Task

1. Add the Fastify plugin with the five routes; every error is `{ code, params }`
   (`text_template_not_found`, `text_template_in_use`, `invalid_request`).
2. Compute `usageCount` with `arrayContains(tickets.faultTemplateKeys, [key])`.
   Create writes both translations in one transaction, PATCH upserts them.
3. Register the plugin in `buildServer` after the branding routes.
4. Point `faultTemplateKeySchema` at the shared key schema instead of a second
   regex.
5. Integration test the guards, create/archive/unarchive/edit, delete of an
   unused template and the `409` of a template a ticket carries.

## Non-goals

- No web page (WP-M2-40c/40d) and no form change (WP-M2-40e/40f).
- No permission key of its own: the existing `settings.read`/`settings.write`.
- No hard delete of a template that a ticket carries, not even with a flag.

## Acceptance

```bash
npx vitest run apps/api/src/settings/__tests__/textTemplates.integration.spec.ts
npm run typecheck --workspaces --if-present
npm run lint
npm run wp:check
```
```

Expected: all green; the integration spec really runs against the database.

## Handoff

- Files changed: the plugin, the registration, the shared key schema and the test
- Interfaces added: the five routes above
- Verified: `npx vitest run` (8 API integration tests green), `npm run typecheck`, `npm run lint`
- Follow-up WP: WP-M2-40c (the admin page)
- Open question: none
