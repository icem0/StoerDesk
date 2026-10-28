# WP-M2-01: Objektliste CRUD (API)

depends-on: WP-M1-09
milestone: m2

## Ziel

GET/POST/PATCH/DELETE /api/v1/objects (Soft-Delete). Permission object.read/write/delete.

## Spec-Referenzen

- specs/08-objects-api.md §Objektliste
- specs/02-data-model.md §objects, §systems

## Aufgabe

1. Service `apps/api/src/objects/service.ts` (list mit Suche/Filter, create, update, softDelete)
2. Routes + Zod-Schemas in `packages/shared/src/schemas/object.ts`
3. Tests: CRUD, 403 ohne object.write, Suche filtert, Soft-Delete setzt active=false

## Akzeptanz

- 6 Tests grün
