# WP-M4-13: JS cancellation-comment overlay

format: small-model
status: done
depends-on: WP-M4-10
phase: 4
context-budget: 15k tokens
spec: PLAN.md §7
spec-lines: 20

files-read:

- apps/web/src/features/tickets/ticket-detail-page.tsx
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json

files-write:

- apps/web/src/features/tickets/ticket-detail-page.tsx — `stornieren` / `stornierung aufheben` open a JS dialog overlay for the comment instead of an inline text field in the menu; the dialog validates the min-5-char reason and calls the existing `cancelled`/`uncancelled` transition; delete confirmation stays inline
- apps/web/src/i18n/locales/de/ticket.json — `detail.storno.*` keys
- apps/web/src/i18n/locales/en/ticket.json — `detail.storno.*` keys in English
- apps/web/e2e/workflow.spec.ts — drive the options dropdown instead of the removed `select[name="ticketAction"]`
- apps/web/e2e/offline-internal.spec.ts — same

interfaces:

- no API change; reuses `POST /api/v1/tickets/:ticketNo/cancel` and `POST /api/v1/tickets/:ticketNo/uncancel`

## Task

1. Added `stornoOpen`, `stornoReason`, `stornoMode` state.
2. `stornieren`/`stornierung aufheben` open the storno dialog (dropdown closes); other workflow actions keep the dropdown open and show their inline confirmation panel below the chosen entry.
3. Rendered a JS dialog overlay (backdrop, closes on click-away/Escape) with title, reason input, confirm button (disabled while reason < 5 chars), abort button; on confirm calls `cancelled`/`uncancelled`.
4. Removed the inline cancel/uncancel confirm fields from the menu; delete confirmation stays inline.
5. i18n keys `detail.storno.*` in `de` and `en`.
6. Updated both phase-4/phase-5 E2E specs to open the options dropdown and click the entry text instead of `select[name="ticketAction"]`.

## Non-goals

- No API, schema, migration or permission change.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
npm run build
```

Expected: all green; stornieren/stornierung aufheben open a dialog overlay with a reason input instead of an inline menu field.

## Handoff

- Files changed: `apps/web/src/features/tickets/ticket-detail-page.tsx`, `apps/web/src/i18n/locales/de/ticket.json`, `apps/web/src/i18n/locales/en/ticket.json`, `apps/web/e2e/workflow.spec.ts`, `apps/web/e2e/offline-internal.spec.ts`
- Interfaces added: none (UI rework only)
- Verified: typecheck, eslint, vitest (545 tests), i18n:check (692/692), wp:check (234/234)
- Follow-up WP: none
- Open question: none
