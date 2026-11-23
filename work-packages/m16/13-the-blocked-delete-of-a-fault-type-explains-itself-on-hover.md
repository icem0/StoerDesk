# WP-M16-13: the blocked delete of a fault type explains itself on hover

format: small-model
status: done
depends-on: WP-M2-40c, WP-M16-10b
phase: 16
milestone: m16
context-budget: 12k tokens
spec: specs/06-report-form.md §7.9; PLAN.md §14
spec-lines: 25

files-read:

- apps/web/src/admin/text-templates-page.tsx
- apps/web/src/admin/__tests__/text-templates-page.test.tsx
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/admin/oncall-page.tsx
- specs/06-report-form.md (§7.9)

files-write:

- apps/web/src/admin/text-templates-page.tsx
- apps/web/src/admin/__tests__/text-templates-page.test.tsx

interfaces:

- the delete button of a fault type that a ticket still carries: disabled, grey and
  with the reason as the tooltip of the button — no text of its own in the row
- `admin.textTemplates.deleteBlocked` — unchanged key, now the tooltip of the
  blocked delete button instead of a line under it

## Task

The office read the fault type administration (`/admin/text-templates`) and asked:
the hint „Wird von Vorgängen verwendet" breaks the layout of the row; the delete
button should simply be greyed out and the hint should appear on mouse-over.

1. `DeleteButton` (apps/web/src/admin/text-templates-page.tsx:137) drops the
   `<span>` with `admin.textTemplates.deleteBlocked` under the button.
2. The button sits in a wrapper that carries the hint as its `title`: a disabled
   button shows no tooltip of its own, so the wrapper is the element the mouse
   points at. The wrapper carries the `title` only while `usageCount > 0`.
3. The blocked button is grey (`border-slate-700`, `text-slate-500`); an unused
   fault type keeps the red delete.
4. `apps/web/src/admin/__tests__/text-templates-page.test.tsx` proves the two
   blocked buttons are disabled and carry the hint as their tooltip, that the hint
   is no text of its own in the row and that the delete of an unused fault type
   stays enabled.

## Non-goals

- No change of the API, of the delete guard (`409 text_template_in_use`) or of the
  usage count.
- No new i18n key — the German and the English text of the hint stay as they are.
- No change of the detected errors administration
  (`apps/web/src/admin/detected-errors-page.tsx`): it carries the same line, but
  the office named the fault types.
- No own tooltip component: the hint is the `title` of the button, as the delete of
  a pool with shifts in the readiness administration does.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
npm run build
```

Expected: all green; the new test fails before the change (the hint is a text of
its own, no button carries a `title`) and passes after it.

## Handoff

- Files changed: `apps/web/src/admin/text-templates-page.tsx`,
  `apps/web/src/admin/__tests__/text-templates-page.test.tsx`, this document, the
  backlog table of `work-packages/README.md`, `PLAN.md` §16 and `CHANGELOG.md`
- Interfaces added: none — the hint keeps its key and moves from a line under the
  button to the tooltip of the button
- Verified: the commands above
- Follow-up WP: none — the detected errors administration carries the same line
  and is named in the non-goals of this WP
- Open question: none
