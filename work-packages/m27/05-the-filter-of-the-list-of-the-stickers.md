# WP-M27-05: the filter of the list of the stickers

format: ctx-256k
status: done
depends-on: WP-M27-04b
phase: 27
milestone: m27
context-budget: 40k tokens
spec: specs/08-objects-api.md §9.1, §9.3, ADR-0050
spec-lines: 160
changed-lines: 480

files-read:

- specs/08-objects-api.md §9.1 (the list query), §9.3 (the route and the data of the stickers)
- docs/DECISIONS/0050-the-sticker-is-a-template.md (the decision)
- packages/shared/src/schemas/object.ts (`objectListQuerySchema`, the summary)
- apps/api/src/objects/service.ts (`whereFromQuery`, the route of the list)
- apps/api/src/objects/__tests__/objects.integration.spec.ts (the harness of the route test)
- apps/web/src/features/objects/sticker-page.tsx (the page of WP-M27-04b)
- apps/web/src/features/objects/__tests__/sticker-page.test.tsx (the test of the page)
- apps/web/src/features/objects/object-list-page.tsx (the filters of the object list)
- apps/web/src/i18n/locales/de/object.json (the texts of the namespace `object`)
- work-packages/README.md (the backlog of record)

files-write:

- apps/api/src/objects/service.ts
- packages/shared/src/schemas/object.ts
- apps/api/src/objects/__tests__/objects.integration.spec.ts
- apps/web/src/features/objects/sticker-page.tsx
- apps/web/src/features/objects/__tests__/sticker-page.test.tsx
- apps/web/src/i18n/locales/de/object.json, apps/web/src/i18n/locales/en/object.json
- work-packages/m27/05-the-filter-of-the-list-of-the-stickers.md

interfaces:

- `GET /api/v1/objects/cities` — the places of the active objects (`object.read`)
- `objectCityListResponseSchema` — the contract of the answer
- `StickerPage` — the filter of the list: search, place, activity, select all and select none

## Task

The list of the stickers was filtered with one free-text field over three
fields of the objects that the browser already held. The filter belongs to the
server — the office prints a part of the object list, and the list is a part of
the database.

1. **The route** `GET /api/v1/objects/cities` in `apps/api/src/objects/service.ts`
   (`object.read`): it answers the distinct places of the active objects,
   sorted. The place of the filter is a list and not a free-text field: the
   query of the list matches a place exactly, so a text field would find
   nothing for „Beis".
2. **The contract** `objectCityListResponseSchema` in
   `packages/shared/src/schemas/object.ts`: `{ cities: string[] }`.
3. **The page** `apps/web/src/features/objects/sticker-page.tsx`: the list is
   asked from the server with the query of §9.1 — `search` (debounced by 300 ms),
   `active` (`true`, `false`, `all`) and `city` (the select of the places).
   The checklist knows „Alle auswählen“ and „Keine auswählen“, and a new filter
   shows a new list: the selection of the old one does not follow it.
4. **The texts** in `apps/web/src/i18n/locales/de/object.json` and
   `.../en/object.json`: the place, the activity and its three values, the two
   buttons of the selection.
5. **The tests**: the integration test of the object list answers the places
   (401 without a session, the places of the active objects) and the test of
   the page filters on the server, asks for the places and the activity and
   selects all objects and none of them.

## Non-goals

- No filter of the system type — the API has no such filter since WP-M2-83.
- No copies per object and no PDF endpoint.
- No change of the query of the object list and no migration.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new cases fail before the change and pass after it.

## Handoff

- Files changed: the seven files above
- Interfaces added: the route of the places and the contract of its answer
- Verified: `npm run check` green (typecheck, lint, the tests of the web and the
  API, i18n, wp-check, the Playwright smoke on a throwaway database); the test
  of the page shows that the filter asks the server, that a new filter resets
  the selection and that the checklist can be selected completely or not at all
- Follow-up WP: WP-M27-06 (the criterion of the phase)
- Open question: none
