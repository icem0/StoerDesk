format: small-model
status: pending
depends-on: WP-M2-85
phase: 2
context-budget: 12k tokens
spec: PLAN.md §11, PLAN.md §14
spec-lines: 30

files-read:

- apps/web/src/features/objects/object-create-page.tsx
- apps/web/src/features/objects/object-edit-page.tsx
- apps/web/src/features/objects/object-list-page.tsx
- apps/web/src/i18n/locales/de/object.json
- apps/web/src/i18n/locales/en/object.json

files-write:

- apps/web/src/features/objects/object-create-page.tsx
- apps/web/src/features/objects/object-edit-page.tsx
- apps/web/src/features/objects/object-list-page.tsx

interfaces:

- `object-create-page.tsx`: removes `systems` state, `addSystem`/`removeSystem`/`setSystemType`/`setSystemLabel`, the systems section (title, type/label inputs, add/remove buttons), `systems` from submit payload.
- `object-edit-page.tsx`: same removals for edit.
- `object-list-page.tsx`: removes `systemChips` call from `ObjectRow`, removes `systemType` filter select and its state.

## Task

Remove system management from the object UI pages.

1. `object-create-page.tsx`: no systems section; object created without systems.
2. `object-edit-page.tsx`: no systems section; edit without systems.
3. `object-list-page.tsx`: object rows no longer show system chips; no `systemType` filter.

## Non-goals

- No i18n changes here (WP-M2-87).
- No API changes here (WP-M2-83).

## Acceptance

Run and report the exact commands:

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run wp:check
```

## Handoff

- Files changed: `apps/web/src/features/objects/object-create-page.tsx`, `apps/web/src/features/objects/object-edit-page.tsx`, `apps/web/src/features/objects/object-list-page.tsx`
- Follow-up WP: WP-M2-87 (i18n)
- Open question: none
