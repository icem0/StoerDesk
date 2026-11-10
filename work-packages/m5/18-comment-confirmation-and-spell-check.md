# WP-M5-18: comment confirmation and browser spell check

format: small-model
status: done
depends-on: WP-M5-11, WP-M5-17
phase: 5
milestone: m5
context-budget: 16k tokens
spec: PLAN.md §14 (ticket detail), PLAN.md §6.1 (append-only events)
spec-lines: 20

files-read:

- apps/web/src/features/tickets/ticket-detail-page.tsx — comment composer, storno dialog, save path
- apps/web/src/i18n/locales/de/ticket.json and `en/ticket.json` — the `detail.comment` keys
- work-packages/m5/11-comment-facelift.md — the composer of the previous package

files-write:

- apps/web/src/features/tickets/ticket-detail-page.tsx — the confirmation dialog and the spell check
- apps/web/src/i18n/locales/de/ticket.json — the `detail.comment.*` keys
- apps/web/src/i18n/locales/en/ticket.json — the `detail.comment.*` keys
- apps/web/src/features/tickets/__tests__/ticket-detail-comment.test.tsx — the dialog and the spell check test

interfaces:

- `submitComment()` opens the confirmation dialog instead of writing; the
  write itself runs in `saveComment()`
- the dialog `role="dialog"` with `aria-modal="true"`, the warning
  `detail.comment.confirmText` and the buttons `detail.comment.confirmSubmit`
  and `detail.comment.confirmAbort`
- the comment textarea carries `lang` (the interface language) and `spellCheck`

## Task

1. A comment is an append-only event of the ticket: it can neither be changed
   nor be deleted after it was saved (PLAN.md §6.1). Clicking "Kommentar
   speichern" now opens a dialog that names that, shows the text again and
   offers "Speichern" and "Abbrechen"; only the first button writes.
2. The dialog follows the overlay of the storno dialog: `role="dialog"`,
   `aria-modal`, a backdrop click and Escape close it without a write.
3. The composer checks the spelling with the dictionary of the browser: the
   textarea carries the interface language (`de` or `en`) and `spellCheck`, and
   a short line under the field names the browser spell check.
4. i18n: `detail.comment.confirmTitle`, `detail.comment.confirmText`,
   `detail.comment.confirmSubmit`, `detail.comment.confirmAbort` and
   `detail.comment.spellcheck` in `de` and `en`.
5. Test: the warning appears before the write, "Abbrechen" writes nothing, the
   confirmed write posts the text, and the field carries the language and the
   spell check.

## Non-goals

- No editing or deleting of a comment after it was saved — the dialog only
  warns.
- No own dictionary and no new dependency: the spell check is the one of the
  browser, so it works offline and ships no extra download.
- No change of the public comment of the report form and no change of the
  API.

## Acceptance

```bash
npm run typecheck -w @stoerdesk/web
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new test fails before the change and passes after it.

## Handoff

- Files changed: `apps/web/src/features/tickets/ticket-detail-page.tsx`,
  `apps/web/src/i18n/locales/de/ticket.json`,
  `apps/web/src/i18n/locales/en/ticket.json`,
  `apps/web/src/features/tickets/__tests__/ticket-detail-comment.test.tsx`
- Interfaces added: `saveComment()`, the confirmation dialog, the
  `detail.comment.confirm*` and `detail.comment.spellcheck` keys
- Verified: `npm run typecheck -w @stoerdesk/web`, `npm run lint`,
  `npm run test:run`, `npm run i18n:check`, `npm run wp:check`
- Follow-up WP: none
- Open question: none
