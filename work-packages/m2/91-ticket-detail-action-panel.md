# WP-M2-91: ticket detail action panel with inline fields

format: small-model
status: implemented
depends-on: WP-M2-18b / WP-M2-19d (detail page), WP-M2-78 (delete button), WP-M5-05 (offline queue)
phase: 2
context-budget: 20k tokens
spec: PLAN.md §14 (UI), PLAN.md §4 (actions)
spec-lines: 10

files-read:

- apps/web/src/features/tickets/ticket-detail-page.tsx — actions toggle + `window.prompt`/`alert`/`confirm` (WP-M2-19d)
- apps/web/e2e/workflow.spec.ts — clicks the actions toggle, then action buttons (WP-M4-01)
- apps/web/e2e/offline-internal.spec.ts — answers `window.prompt` dialogs via Playwright (WP-M5-08)
- apps/web/src/i18n/locales/de/ticket.json — `detail.prompt.*` and `detail.errors.*` keys

files-write:

- apps/web/src/features/tickets/ticket-detail-page.tsx — always visible action panel, inline fields, inline errors
- apps/web/src/i18n/locales/de/ticket.json — new `detail.errors.*` keys (de reference)
- apps/web/src/i18n/locales/en/ticket.json — same keys, English labels

interfaces:

- no actions toggle any more: an always visible action panel directly below the title block,
  `sticky bottom-4` inside the page so the buttons stay reachable on mobile (§14)
- payload-carrying actions show their input fields inline in the panel (`name`d inputs,
  placeholder = the existing `detail.prompt.*` labels); the action button submits the
  current values, a missing required value sets `detail.errors.fieldRequired` inline
- ApiError and delete failures set the inline error line (`role="alert"`) in the panel
  instead of `window.alert`; the offline queue path stays as in WP-M5-05
- hard delete: input `deleteConfirm` must equal the ticket number
  (`detail.prompt.deleteConfirmNumber` placeholder, `detail.prompt.deleteConfirm` warning);
  mismatch → `detail.errors.deleteConfirmMismatch`
- E2E: action buttons are clicked directly (no toggle click), acknowledge fills
  `input[name="acknowledgeResult"]` — no more Playwright `dialog` events

## Task

1. Remove `showActions`/the toggle button; render the action panel as a direct flex child
   after the offline notice: `col-span-full sticky bottom-4 z-10 rounded bg-slate-900/95
   border border-slate-700 p-3`, heading `t('detail.actions')`.
2. `const [fields, setFields] = useState<Record<string, string>>({})` and
   `fieldInput(name, promptKey)` (`<input>` with `value={fields[name] ?? ''}`,
   `placeholder={t(promptKey)}`, `onChange` merges the new value, touch target `min-h-11`).
3. Every payload action gets its named input (existing prompt keys as placeholders) plus
   a submit button reading the trimmed values; empty required value →
   `setLastError(t('detail.errors.fieldRequired'))`, no dialog anywhere.
4. Replace all `window.prompt`/`window.confirm`/`alert` usage: ApiError/delete/pause/resume
   failures set `lastError` (rendered as `text-rose-400 … role="alert"` line in the panel);
   success clears `lastError` and the fields.
5. Delete button: reads `fields.deleteConfirm`; `handleDelete(confirmed)` requires
   `confirmed === ticketNo`, otherwise `detail.errors.deleteConfirmMismatch`.
6. Buttons get `min-h-11` (44 px touch targets, §14 AA rule).
7. `workflow.spec.ts`: `performAction(page, buttonName)` clicks the button directly
   (drop the `actions` text and the toggle click); `offline-internal.spec.ts`: fill
   `input[name="acknowledgeResult"]` with `fixed` and drop `answerAcknowledgeDialogs`.
8. `ticket.json` de/en: `detail.errors.fieldRequired`,
   `detail.errors.deleteConfirmMismatch`, `detail.prompt.deleteConfirmNumber`.

## Non-goals

- No change to the action semantics, the API or the offline queue logic (WP-M5-05 keeps).
- No pause/resume inline move (they stay inside `TicketTimeline`, WP-M6-06).
- No theme switch (WP-M2-92 chain) and no ticket-list re-layout (WP-M2-91b).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the CI `check` run additionally runs the two E2E specs with
Chromium (locally skipped — no browser, reported as unverified).

## Handoff

- Files changed: `apps/web/src/features/tickets/ticket-detail-page.tsx`,
  `apps/web/e2e/workflow.spec.ts`, `apps/web/e2e/offline-internal.spec.ts`,
  `apps/web/src/i18n/locales/de/ticket.json`, `apps/web/src/i18n/locales/en/ticket.json`
- Interfaces added: always visible `data-testid="ticket-actions"` panel (`sticky
  bottom-4`), `fieldInput` inline named inputs (`workOrderType`,
  `workOrderNumber`, `declineReason`, `acknowledgeResult`, `acknowledgeNote`,
  `commentText`, `cancelReason`, `uncancelReason`, `deleteConfirm`) with
  `detail.prompt.*` placeholders, submit buttons reading the trimmed values,
  inline `role="alert"` error line from `lastError`; delete confirms with the
  ticket number; E2E clicks buttons directly, acknowledge fills
  `input[name="acknowledgeResult"]`, no Playwright `dialog` handling left.
  New keys `detail.errors.fieldRequired`, `detail.errors.deleteConfirmMismatch`,
  `detail.prompt.deleteConfirmNumber` (de/en).
- Verified: `npm run check` green; e2e skipped locally (no Chromium) — the two
  adapted E2E specs run in the CI `check` run and must be green there.
- Follow-up WP: WP-M2-91b (mobile-first ticket list) and the WP-M2-92 chain
  (92 DB column, 92b schemas/API, 92c shell + palette, 92d users settings) — WP files created.
- Open question: none
