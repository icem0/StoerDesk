# WP-M2-13: Object edit UI (update)

format: small-model
status: in_progress
depends-on: WP-M2-12
phase: 2
context-budget: 22k tokens
spec: PLAN.md §11 (objects), specs/08-objects-api.md §9.1
spec-lines: 50

files-read:

- apps/api/src/objects/service.ts — GET/PATCH /api/v1/objects/:objectNo contract
- packages/shared/src/schemas/object.ts — updateObjectRequestSchema, objectSummarySchema
- apps/web/src/features/objects/object-create-page.tsx — create form pattern
- apps/web/src/lib/api.ts — apiFetch client

files-write:

- apps/web/src/features/objects/object-edit-page.tsx
- apps/web/src/routes/index.tsx — /objects/:objectNo/edit route
- apps/web/src/i18n/locales/de/object.json
- apps/web/src/i18n/locales/en/object.json

interfaces:

- `ObjectEditPage` React component: loads `GET /api/v1/objects/:objectNo`, renders a
  prefilled form for all mutable fields, submits `PATCH /api/v1/objects/:objectNo`,
  redirects to `/objects` on success
- Route `/objects/:objectNo/edit` guarded by `RequireSession`, permission `object.write`
  enforced server-side

## Task

1. `apps/web/src/features/objects/object-edit-page.tsx`: controlled edit form with
   fields matching `updateObjectRequestSchema` (objectNo, name, address, contact,
   externalId, notes, systems), prefilled from the GET response, submit via `apiFetch`
   PATCH, error display for `422 object_no_taken` and `404 object_not_found`.
2. `apps/web/src/routes/index.tsx`: add guarded `/objects/:objectNo/edit` route.
3. `apps/web/src/i18n/locales/{de,en}/object.json`: add `object.edit.*` keys.

## Non-goals

- Delete (WP-M2-14)
- System sync editor with existing system rows (edit-only systems array)
- QR regeneration

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
- Interfaces added: `ObjectEditPage`, `/objects/:objectNo/edit` route, `object.edit.*` i18n keys
- Follow-up WP: WP-M2-14 (object delete)
