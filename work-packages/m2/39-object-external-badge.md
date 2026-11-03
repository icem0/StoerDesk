# WP-M2-39: external-maintained badge in the object list

format: small-model
status: planned
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

Expected: all green; the object-list test still passes and de/en stay parallel.

## Handoff

- Files changed: the three files above, `docs/REPO-MAP.md`, `work-packages/README.md`
- Interfaces added: `object:list.externalBadge`, `object:list.externalHint`
- Verified: —
- Follow-up WP: none — the BMAcloud chain 32 … 39 is complete
- Open question: none
