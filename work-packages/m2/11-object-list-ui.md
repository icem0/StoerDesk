# WP-M2-11: Object list UI (read)

format: small-model
status: implemented
depends-on: WP-M2-01
phase: 2
context-budget: 20k tokens
spec: PLAN.md §11 (objects), specs/08-objects-api.md §9.1
spec-lines: 60

files-read:

- apps/api/src/objects/service.ts — GET /api/v1/objects contract
- packages/shared/src/schemas/object.ts — objectSummarySchema, objectListQuerySchema
- apps/web/src/features/objects/sticker-page.tsx — existing object list fetch pattern
- apps/web/src/lib/api.ts — apiFetch client

files-write:

- apps/web/src/features/objects/object-list-page.tsx
- apps/web/src/routes/index.tsx — /objects route
- apps/web/src/i18n/locales/de/object.json
- apps/web/src/i18n/locales/en/object.json

interfaces:

- `ObjectListPage` React component: fetches `GET /api/v1/objects`, renders a searchable,
  filterable table (objectNo, name, city, systems, active), no create/edit/delete yet
- Route `/objects` guarded by `RequireSession`, permission `object.read` enforced server-side

## Task

1. `apps/web/src/features/objects/object-list-page.tsx`: table page with Tanstack Query,
   client-side search over objectNo/name/city, server filters `active`, `city`,
   `systemType` passed as query params, active/inactive badge, system type chips per row.
2. `apps/web/src/routes/index.tsx`: add guarded `/objects` route rendering `ObjectListPage`.
3. `apps/web/src/i18n/locales/{de,en}/object.json`: add `object.list.*` keys (de reference,
   en complete).

## Non-goals

- Create / update / delete (WP-M2-12 … WP-M2-14)
- System sync editor, QR regeneration
- Ticket linking

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
npm run i18n:check
```

Expected: all green. No database needed for typecheck/lint; the page fetches from the
existing API at runtime.

## Handoff

- Files changed: the four files above
- Interfaces added: `ObjectListPage`, `/objects` route, `object.list.*` i18n keys
- Follow-up WP: WP-M2-12 (object create form)
