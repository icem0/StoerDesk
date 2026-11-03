# WP-M2-16: Internal ticket creation UI (web)

format: small-model
status: implemented
depends-on: WP-M2-15
phase: 2
context-budget: 22k tokens
spec: PLAN.md §7 (ticket workflow), PLAN.md §10 (report form fields), specs/06-report-form.md §7.2
spec-lines: 50

files-read:

- apps/api/src/tickets/internal.ts — POST /api/v1/tickets contract
- apps/api/src/objects/service.ts — GET /api/v1/objects contract
- packages/shared/src/schemas/ticket.ts — internalCreateTicketRequestSchema
- apps/web/src/lib/api.ts — apiFetch client
- apps/web/src/features/tickets/report-form-page.tsx — existing public form pattern

files-write:

- apps/web/src/features/tickets/internal-create-page.tsx
- apps/web/src/routes/index.tsx — /tickets/create route
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json

interfaces:

- `InternalCreatePage` React component: object select (from GET /api/v1/objects),
  system select (filtered to chosen object), title, description, fault template
  checkboxes, priority select, contact fields; submits POST /api/v1/tickets with
  `ticket.create` permission enforced server-side; redirects to `/objects` on success
- Route `/tickets/create` guarded by `RequireSession`

## Task

1. `apps/web/src/features/tickets/internal-create-page.tsx`: controlled form with
   object/system selects, title, description, fault template keys (checkboxes over
   seeded STANDARD_TEXTS), priority (low/normal/high/critical), contact fields;
   client validation, submit via apiFetch, error display for 422/404.
2. `apps/web/src/routes/index.tsx`: add guarded `/tickets/create` route.
3. `apps/web/src/i18n/locales/{de,en}/ticket.json`: add `ticket.internal.create.*` keys.

## Non-goals

- Ticket list / detail (WP-M2-17, WP-M2-18)
- Work order (AA/SA) — phase 4
- Photos on internal creation (public form has them; internal arrives later)

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
npm run i18n:check
```

Expected: all green.

## Handoff

- Files changed: the four files above
- Interfaces added: `InternalCreatePage`, `/tickets/create` route, `ticket.internal.create.*` i18n keys
- Follow-up WP: WP-M2-17 (ticket list)
