# WP-M2-90c: optional title field on the public report form

format: small-model
status: implemented
depends-on: WP-M2-90
phase: 2
context-budget: 16k tokens
spec: PLAN.md §10 (report form fields), PLAN.md §3.1 (i18n mechanics)
spec-lines: 15

files-read:

- apps/web/src/features/tickets/report-form-page.tsx — the form, `sendReport`, `QrResolveResponse` (WP-M2-05)
- packages/shared/src/schemas/object.ts — `titleEnabled` on `qrResolveResponseSchema` (WP-M2-90)
- apps/web/src/features/tickets/__tests__/report-form-page.test.tsx — the stubbed resolve and submit test
- apps/web/src/i18n/locales/de/ticket.json — the `report.*` keys (WP-M2-05)

files-write:

- apps/web/src/features/tickets/report-form-page.tsx — conditional title input and body title
- apps/web/src/i18n/locales/de/ticket.json — `report.titleField.label` (de reference)
- apps/web/src/i18n/locales/en/ticket.json — same key, English label

interfaces:

- while `qr.data.titleEnabled` is true the form renders one optional title input (max 200
  chars, label `ticket:report.titleField.label`); otherwise no title input exists at all
- the submit body carries `title: <trimmed value>` only when enabled and non-empty,
  otherwise `undefined` — the offline outbox body follows the same rule

## Task

1. `report-form-page.tsx`: `const titleEnabled = qr.data?.titleEnabled === true`; a
   `title` state and a `TitleField` component (label + input, `maxLength={200}`) rendered
   inside the form between the fault chips and the free text **only when `titleEnabled`**.
2. In `sendReport`: `title: titleEnabled && title.trim() !== '' ? title.trim() : undefined`
   (replaces the `title: undefined` placeholder of WP-M2-05); add `titleEnabled`/`title`
   to the `useCallback` dependency list.
3. `ticket.json` de/en under `report`: `titleField.label` — de "Kurztitok (optional)",
   en "Short title (optional)".
4. `report-form-page.test.tsx`: with `titleEnabled: true` in the stubbed resolve the input
   renders and a typed title reaches the `POST` body; with `titleEnabled: false` (existing
   stub) no title input renders and the body keeps `title: undefined`.

## Non-goals

- No title in the internal create form or the ticket detail UI.
- No server change (WP-M2-89/90 own the API side).
- No validation beyond the shared `trimmedText(200)` schema.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green.

## Handoff

- Files changed: `apps/web/src/features/tickets/report-form-page.tsx`,
  `apps/web/src/features/tickets/__tests__/report-form-page.test.tsx`,
  `apps/web/src/i18n/locales/de/ticket.json`, `apps/web/src/i18n/locales/en/ticket.json`
- Interfaces added: `TitleField` renders only while `qr.data?.titleEnabled === true`
  between the fault chips and the free text; the submit body (online and offline
  outbox) carries `title: <trimmed>` only when enabled and non-empty; i18n key
  `report.titleField.label` in de ("Kurztitok (optional)") and en.
- Verified: `npm run check` green (e2e skipped locally — no Chromium); the new test
  proves the title input and body title with `titleEnabled: true`, the existing
  tests keep `title: undefined` with the false stub.
- Follow-up WP: none
- Open question: none
