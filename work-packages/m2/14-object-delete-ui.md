# WP-M2-14: Object delete UI (soft delete)

format: small-model
status: implemented
depends-on: WP-M2-11
phase: 2
context-budget: 20k tokens
spec: PLAN.md §11 (objects), specs/08-objects-api.md §9.1
spec-lines: 40

files-read:

- apps/api/src/objects/service.ts — DELETE /api/v1/objects/:objectNo contract
- apps/web/src/features/objects/object-list-page.tsx — existing list page
- apps/web/src/lib/api.ts — apiFetch client

files-write:

- apps/web/src/features/objects/object-list-page.tsx — delete button per row
- apps/web/src/i18n/locales/de/object.json
- apps/web/src/i18n/locales/en/object.json

interfaces:

- Delete button on each object list row: `window.confirm`, then `DELETE /api/v1/objects/:objectNo`,
  on success the TanStack Query cache for the object list is invalidated so the row
  disappears without a full page reload
- `object.delete.*` i18n keys (de reference, en complete)

## Task

1. `apps/web/src/features/objects/object-list-page.tsx`: replace the disabled delete
   button with an active one per row. On click: `window.confirm(t('delete.confirm'))`,
   then `apiFetch('/v1/objects/' + objectNo, { method: 'DELETE' })`, on success
   `queryClient.invalidateQueries({ queryKey: ['objects', 'list'] })`, on error
   show `t('delete.errors.objectNotFound')` / `t('delete.errors.unknown')`.
2. `apps/web/src/i18n/locales/{de,en}/object.json`: add `object.delete.*` keys.

## Non-goals

- Delete from the edit page (list row only)
- Restore of soft-deleted objects
- Cascade delete of systems (server handles ON DELETE CASCADE)

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

- Files changed: the three files above
- Interfaces added: delete action on object list rows, `object.delete.*` i18n keys
- Follow-up WP: WP-M2-15 (internal ticket creation API)
