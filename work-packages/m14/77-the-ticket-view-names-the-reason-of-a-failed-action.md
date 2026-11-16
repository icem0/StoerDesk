# WP-M14-77: The ticket view names the reason of a failed action

format: small-model
status: done
depends-on: WP-M14-76
phase: 14
milestone: m14
context-budget: 16k tokens
spec: PLAN.md §3 (the error contract), specs/07-escalation.md §7.10 (the stage selection)
spec-lines: 20

files-read:

- apps/web/src/features/tickets/ticket-detail-page.tsx (`actionErrorMessage`)
- apps/web/src/i18n/locales/de/ticket.json (the `detail.errors` texts)
- apps/web/src/i18n/locales/en/ticket.json (the `detail.errors` texts)
- apps/web/src/features/tickets/__tests__/ticket-detail-escalation.test.tsx (the stage selection test)

files-write:

- apps/web/src/features/tickets/ticket-detail-page.tsx
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json
- work-packages/m14/77-the-ticket-view-names-the-reason-of-a-failed-action.md (this document)

interfaces:

- `detail.errors.invalid_request`, `detail.errors.invalid_transition`,
  `detail.errors.ticket_not_found`, `detail.errors.session_invalid`,
  `detail.errors.forbidden` — the texts of the error codes of the workflow routes

## Task

1. The office reads the generic "Die Aktion konnte nicht ausgeführt werden."
   for every failed escalation, because `actionErrorMessage()` of the ticket view
   looks the error code of the API up in `detail.errors` and that namespace only
   knows the codes of the delete. Every other code — `invalid_request`,
   `invalid_transition`, `ticket_not_found`, `session_invalid`, `forbidden` —
   fell back to the generic text, so the reason of the failure was invisible.
2. `apps/web/src/features/tickets/ticket-detail-page.tsx`: the message of
   `invalid_transition` names the status of the ticket (the label of
   `status.values.<key>`, the raw key for a status the administration added);
   every other code is looked up as before, and an unknown code keeps the
   generic text.
3. `apps/web/src/i18n/locales/de/ticket.json` and `.../en/ticket.json`: the five
   texts of the error codes, German as the reference locale.

## Non-goals

- No change of the API: the codes and their params stay as they are.
- No change of the delete texts and of the other pages.
- No new error code — only the texts of the codes the API already answers.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new test fails before the change and passes after it.

## Handoff

- Files changed: `apps/web/src/features/tickets/ticket-detail-page.tsx`,
  `apps/web/src/i18n/locales/de/ticket.json`,
  `apps/web/src/i18n/locales/en/ticket.json`, this document,
  `work-packages/README.md`, `CHANGELOG.md`
- Interfaces added: the five texts of `detail.errors`
- Verified: `npm run check` green (typecheck, lint, 195 files and 1307 tests, E2E
  14 tests); the two new tests fail before the change (the generic notice) and
  pass after it
- Follow-up WP: WP-M14-78 (the offered stages come from the transition table)
- Open question: none
