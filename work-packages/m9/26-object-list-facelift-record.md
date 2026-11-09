# WP-M9-26: record — the object list facelift (retroactive record)

format: small-model
status: done (retroactive record — commit `d1e34eb` landed 2026-11-09 with the subject
`feat(web): object list facelift`, without a WP id and without a work-package document;
the record adds no behaviour, it states what the commit did and which rules still hold)
depends-on: WP-M9-24, WP-M9-25
phase: 9
milestone: m9
context-budget: 16k tokens
spec: specs/08-objects-api.md §9.1 (object list), specs/17-bmacloud-sync.md §17.3–§17.5
(the fields the list stopped showing), PLAN.md §14 (user interface)
spec-lines: 45

files-read:

- apps/web/src/features/objects/object-list-page.tsx — the list as it is now
- apps/web/src/features/objects/__tests__/object-list-page.test.tsx — the list test as it is now
- apps/web/src/i18n/locales/de/object.json — the `list.*` keys of the namespace
- work-packages/m2/39-object-external-badge.md — the badge the commit removed
- work-packages/m2/66-object-list-type-column.md — the type column the commit removed
- apps/api/src/settings/branding-state.ts — its module comment misnumbers the title gates

files-write:

- work-packages/m9/26-object-list-facelift-record.md — this record
- apps/api/src/settings/branding-state.ts — corrects the off-by-one WP references in the
  module comment (the internal creation gate is WP-M9-25, the ticket view gate WP-M9-24)

interfaces:

- none — the record changes no behaviour; it names what `d1e34eb` changed and what still
  holds

## Task (what commit `d1e34eb` actually did)

1. `apps/web/src/features/objects/object-list-page.tsx`: the rows lost the "extern gepflegt"
   badge of WP-M2-39 next to the object number and the whole `Typ` column of WP-M2-66
   (`externalTypeCategory(object.externalType)` with the stored name as title, `—` without)
   — the column header, the cells and the `externalTypeCategory` import left the DOM
   together. In the actions cell the edit and the delete button stopped being "slapped"
   next to each other (`{' '}` between two buttons) and are a flex row
   (`flex gap-2 justify-end`) side by side.
2. `apps/web/src/i18n/locales/{de,en}/object.json`: the keys `list.externalBadge`,
   `list.externalHint` and `list.columns.type` were deleted in both locales; nothing
   references them any more (`npm run i18n:check` verifies the parity and that every
   referenced key exists).
3. The page test was rewritten with the list: one test for the columns that remain
   (number, name, address, active badge per row), one for the side-by-side actions, one
   asserting that no external badge, no type text and no `Typ`/`Type` header exist.
4. Nothing else changed: the API still answers `externalId` and `externalType`
   (`objectSummarySchema`, WP-M2-39/WP-M2-64), the BMAcloud sync still writes them
   (`specs/17-bmacloud-sync.md` §17.3/§17.4), and the object **detail** page still
   carries the external information. Only the presentation in the list rows changed.

## Non-goals

- No code change: the list of the shipped app already is the facelifted one; the record
  documents it.
- No rewrite of WP-M2-39 and WP-M2-66 — both were true when they landed; the record states
  that their **list presentation** was superseded by `d1e34eb` (the data fields stay).
- No filter for externally maintained objects, no new column, no i18n key added.
- No spec change: `specs/17-bmacloud-sync.md` §17.4/§17.5 keep the data contract; the list
  view is governed by `PLAN.md` §14 and the office.

## Acceptance

```bash
npm run wp:check
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
```

Expected: all green; the record commit changes only the `branding-state.ts` doc comment, so
no test changes its result.

## Handoff

- Files changed: this record, `apps/api/src/settings/branding-state.ts` (doc comment only),
  plus `work-packages/README.md`, `docs/REPO-MAP.md`, `PLAN.md` §16, `CHANGELOG.md`
- Interfaces added: none
- Verified: `wp:check`, typecheck, lint, `test:run`, `i18n:check` (see commit report)
- Follow-up WP: none
- Open question: none
