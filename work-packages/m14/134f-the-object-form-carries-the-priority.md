# WP-M14-134f: the object form carries the priority

format: small-model
status: planned
phase: 14
milestone: m14
context-budget: 18k tokens
spec: specs/08-objects-api.md §9.1; ADR-0029
spec-lines: 25

depends-on: WP-M14-134e

files-read:

- apps/web/src/features/objects/object-create-page.tsx (the create form)
- apps/web/src/features/objects/object-edit-page.tsx (the edit form)
- apps/web/src/i18n/locales/de/object.json (the labels of the object pages)
- apps/web/src/features/objects/__tests__/ (the pattern of the page tests)

files-write:

- apps/web/src/features/objects/object-create-page.tsx
- apps/web/src/features/objects/object-edit-page.tsx
- apps/web/src/i18n/locales/de/object.json, apps/web/src/i18n/locales/en/object.json

interfaces:

- The object write of the web app carries `priority` — `null` means the object
  follows the standard
- The label `object.create.fields.priority` and `object.edit.fields.priority`

## Task

1. In the create form and in the edit form of the object, add the field
   "Priorität" with the options "Standard" and the four priorities. The select
   shows the stored deviation: "Standard" when the object has none, otherwise
   the priority of the deviation. The form sends `priority: null` for
   "Standard" and the priority otherwise.
2. The edit form reads the deviation from the `priorityOverride` of the answer,
   not from the effective `priority` — an object that follows the standard
   shows "Standard".
3. Add the labels of the field and of the options in `de` and `en`
   (`object.create.fields.priority`, `object.edit.fields.priority`,
   `object.priority.standard`, `object.priority.low`, `object.priority.normal`,
   `object.priority.high`, `object.priority.critical`).
4. Add a page test: the edit form shows "Standard" for an object without a
   deviation and the priority of the deviation for an object with one.

## Non-goals

- No priority in the object list (the badge comes with a later package).
- No administration page — the standard is edited there (WP-M14-134g).
- No change of the import of the CSV — it sets no deviation.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the object form writes the deviation of the object.

## Handoff

- Files changed: the create form, the edit form, the labels in `de` and `en`
- Interfaces added: the priority field of the object forms
- Verified: `npm run check` (exit 0), the page test of the object form
- Follow-up WP: WP-M14-134g (the administration shows the standard and the deviations)
- Open question: none
