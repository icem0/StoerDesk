# WP-M14-86: The acknowledge result is a selection

format: small-model
status: done
depends-on: WP-M14-78
phase: 14
milestone: m14
context-budget: 14k tokens
spec: PLAN.md §7 (the acknowledge result), apps/api/src/tickets/workflow-routes.ts (`ACK_RESULT`)
spec-lines: 20

files-read:

- apps/web/src/features/tickets/ticket-detail-page.tsx (the `acknowledged` panel, `renderConfirmPanel`)
- apps/web/src/i18n/locales/de/ticket.json (`detail.prompt.acknowledgeResult`)
- apps/web/e2e/offline-internal.spec.ts (the acknowledge step of the replay)
- apps/api/src/tickets/workflow-routes.ts (`ACK_RESULT`)

files-write:

- apps/web/src/features/tickets/ticket-detail-page.tsx
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json
- apps/web/e2e/offline-internal.spec.ts

interfaces:

- `detail.acknowledgeResult.fixed`, `.partially_fixed`, `.follow_up_required`,
  `.no_fault_found` — the labels of the four results of the acknowledge panel
- `select[name="acknowledgeResult"]` — the control the office confirms with

## Task

1. The acknowledge panel of the ticket view asked the result as a free text
   input whose placeholder listed the four values of the API
   (`fixed`, `partially_fixed`, `follow_up_required`, `no_fault_found`). A typo,
   a translation or a capital letter answered `400 invalid_request`, so the
   acknowledgement failed and the office read "Die Angaben wurden abgelehnt."
   (WP-M14-77) without a hint how to fix it.
2. `apps/web/src/features/tickets/ticket-detail-page.tsx`: the input becomes a
   `<select name="acknowledgeResult">` with the four values and a label per
   value; the prompt becomes the unselected first option, so the confirm button
   stays disabled until a value is chosen — the same `missing` rule as before.
3. `de` and `en` `ticket.json`: the four labels; `detail.prompt.acknowledgeResult`
   no longer lists the raw enum values but asks for a choice.
4. `apps/web/e2e/offline-internal.spec.ts`: the acknowledge step selects the
   value instead of typing it.

## Non-goals

- No change of the API contract (`ACK_RESULT` stays the enum of
  `apps/api/src/tickets/workflow-routes.ts`).
- No change of the acknowledge note, of the offline outbox or of the replay.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run i18n:check
npm run test:run
npm run test:e2e
```

Expected: all green.

## Handoff

- Files changed: `apps/web/src/features/tickets/ticket-detail-page.tsx`,
  `apps/web/src/i18n/locales/de/ticket.json`,
  `apps/web/src/i18n/locales/en/ticket.json`,
  `apps/web/e2e/offline-internal.spec.ts`, this document,
  `work-packages/README.md`, `CHANGELOG.md`
- Interfaces added: `detail.acknowledgeResult.*`, `select[name="acknowledgeResult"]`
- Verified: `npm run typecheck --workspace @stoerdesk/web`, `npm run i18n:check`
  (1554 keys in `de` and `en`), `eslint` on the two changed source files and
  `npm run test:e2e` green (14/14 — the offline acknowledge selects `fixed` over
  the new control); `vitest run apps/web/src/features/tickets` green (69 tests)
- Follow-up WP: none
- Open question: none
