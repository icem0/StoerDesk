# WP-M2-39: external-maintained badge in the object list

format: small-model
status: implemented
depends-on: WP-M2-35
phase: 2
context-budget: 12k tokens
spec: specs/17-bmacloud-sync.md §17.5 (object list badge), §17.4 (which objects BMAcloud
owns), specs/08-objects-api.md §9.1
spec-lines: 25

files-read:

- specs/17-bmacloud-sync.md §17.5, §17.4
- apps/web/src/features/objects/object-list-page.tsx — the object table and its badges
- packages/shared/src/schemas/object.ts — `objectSummarySchema` carries `externalId`
- apps/web/src/i18n/locales/de/object.json — the `object` namespace

files-write:

- apps/web/src/features/objects/object-list-page.tsx
- apps/web/src/i18n/locales/de/object.json
- apps/web/src/i18n/locales/en/object.json

interfaces:

- i18n keys `object:list.externalBadge` (de `extern gepflegt`, en `externally maintained`)
  and `object:list.externalHint` (the tooltip/`title` text naming BMAcloud)
- the badge renders only when `externalId !== null`

## Task

1. In the object row of `object-list-page.tsx`, render a quiet badge next to the object
   number when `row.externalId !== null`, labelled `object:list.externalBadge` and carrying
   `object:list.externalHint` as its `title`.
2. Keep the active/inactive badge untouched; the two badges are independent and neither is
   colour-only (`PLAN.md` §14 accessibility).
3. No API change: `objectSummarySchema` already answers `externalId` (WP-M2-01).

## Non-goals

- No edit lock in the object edit form: an office user may still correct a locally
  important field; the next sync overwrites name and address, and that is the documented
  rule of §17.4.
- No filter for externally maintained objects — separate WP if wanted.
- No sync status in the object detail view.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; de/en stay parallel. The object list had **no** page test before this
WP, so the WP adds `apps/web/src/features/objects/__tests__/object-list-page.test.tsx`
(excluded from the file limit) and asserts the badge pair.

## Handoff

- Files changed: the three files above plus the new page test, `docs/REPO-MAP.md`,
  `work-packages/README.md`, `PLAN.md` §16, `CHANGELOG.md`
- Interfaces added: `object:list.externalBadge`, `object:list.externalHint`
- Verified: `npm run check` locally (typecheck, lint with no new warning, 297 tests, 511 de
  and 511 en keys, wp:check; the E2E gate skipped: no usable Chromium); the new page test
  asserts the badge on the object with `externalId`, its absence on the local object, the
  `title` naming BMAcloud and that the active badge of both rows is untouched.
- Follow-up WP: none — the BMAcloud chain 32 … 39 is complete
- Open question: none
