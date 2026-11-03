# WP-M2-12: Object create UI (create)

format: small-model
status: implemented
depends-on: WP-M2-11
phase: 2
context-budget: 22k tokens
spec: PLAN.md §11 (objects), specs/08-objects-api.md §9.1
spec-lines: 50

files-read:

- apps/api/src/objects/service.ts — POST /api/v1/objects contract
- packages/shared/src/schemas/object.ts — createObjectRequestSchema, OBJECT_SYSTEM_TYPES
- apps/web/src/features/objects/object-list-page.tsx — existing list page pattern
- apps/web/src/lib/api.ts — apiFetch client

files-write:

- apps/web/src/features/objects/object-create-page.tsx
- apps/web/src/routes/index.tsx — /objects/create route
- apps/web/src/i18n/locales/de/object.json
- apps/web/src/i18n/locales/en/object.json

interfaces:

- `ObjectCreatePage` React component: form for objectNo, name, address, contact,
  systems; submits `POST /api/v1/objects`; on success redirects to `/objects`
- Route `/objects/create` guarded by `RequireSession`, permission `object.write`
  enforced server-side

## Task

1. `apps/web/src/features/objects/object-create-page.tsx`: controlled form with
   fields matching `createObjectRequestSchema` (objectNo required, name required,
   address/contact optional, systems as type+label chips), client validation with
   Zod schemas from `@stoerdesk/shared`, submit via `apiFetch`, error display
   for `422 object_no_taken` and `400 invalid_request`.
2. `apps/web/src/routes/index.tsx`: add guarded `/objects/create` route.
3. `apps/web/src/i18n/locales/{de,en}/object.json`: add `object.create.*` keys.

## Non-goals

- Edit / delete (WP-M2-13, WP-M2-14)
- System sync editor with existing system rows (create-only systems array)
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

- Files changed: the five files above
- Interfaces added: `ObjectCreatePage`, `/objects/create` route, `object.create.*` i18n keys
- Follow-up WP: WP-M2-13 (object edit form)
