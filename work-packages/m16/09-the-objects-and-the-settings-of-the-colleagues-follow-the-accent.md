# WP-M16-09: the objects and the settings of the colleagues follow the accent

format: small-model
status: done
depends-on: WP-M16-08
phase: 16
milestone: m16
context-budget: 16k tokens
spec: specs/13-ui.md §14.4; PLAN.md §14; ADR-0036
spec-lines: 60

files-read:

- apps/web/src/features/objects/object-list-page.tsx (the actions of the object list)
- apps/web/src/features/objects/object-create-page.tsx (the form of a new object)
- apps/web/src/features/objects/object-edit-page.tsx (the form of an object)
- apps/web/src/settings/my-settings-page.tsx (the personal settings)

files-write:

- apps/web/src/features/objects/object-list-page.tsx
- apps/web/src/features/objects/object-create-page.tsx
- apps/web/src/features/objects/object-edit-page.tsx
- apps/web/src/settings/my-settings-page.tsx

interfaces:

- the primary action of the object pages and of the personal settings wears the
  accent of the instance

## Task

1. The primary buttons of the object list, of the form of a new object, of the
   form of an object and of the personal settings wear the accent of the
   instance: `bg-accent-600 text-white hover:bg-accent-700`.
2. The focus ring of these buttons is `focus-visible:ring-accent-400`.

## Non-goals

- No change of the contract, of the API and of the texts.
- No change of the destructive actions and of the semantic colours.
- No change of the administration pages — WP-M16-10a … WP-M16-10g carry them.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the existing tests of the pages stay green.

## Handoff

- Files changed: the four pages of the task, `work-packages/README.md`, `CHANGELOG.md`
- Interfaces added: the primary action of the object pages and of the personal settings
  wears the accent of the instance
- Verified: `npm run typecheck`, `npm run lint`, `npm run test:run`, `npm run wp:check`
- Follow-up WP: WP-M16-10a … WP-M16-10g (the administration) — each file exists
  in the commit of the split
- Open question: none
