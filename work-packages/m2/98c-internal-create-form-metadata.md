# WP-M2-98c: internal create form captures reporter, channel and report time

format: small-model
status: implemented
depends-on: WP-M2-98b
phase: 2
context-budget: 26k tokens
spec: PLAN.md §7 rule 1, specs/06-report-form.md §7.3.4, PLAN.md §10
spec-lines: 60

files-read:

- apps/web/src/features/tickets/internal-create-page.tsx — form and submit
- packages/shared/src/schemas/ticket.ts — request fields of WP-M2-98b
- apps/web/src/i18n/locales/de/ticket.json — `internal.create`
- apps/web/src/i18n/locales/en/ticket.json — `internal.create`
- apps/web/src/features/tickets/__tests__/internal-create-page.test.tsx — stubs

files-write:

- apps/web/src/features/tickets/internal-create-page.tsx — sections and payload
- apps/web/src/i18n/locales/de/ticket.json — German labels
- apps/web/src/i18n/locales/en/ticket.json — English labels
- apps/web/src/features/tickets/__tests__/internal-create-page.test.tsx — form test

interfaces:

- form sections `Meldender` (name, phone, e-mail or internal user picker),
  `Meldezeit` (`datetime-local`, default now, past allowed) and `Meldungskanal`
  (one radio of Telefon / E-Mail / Messenger)
- reporter-type radio `Mitarbeiter (intern)` / `Externer Melder`; internal shows a
  bounded user picker fed by `GET /v1/tickets/reporter-users`
- submit sends `reportedAt`, `reporterChannel`, `reporterKind`,
  `reportedByUserId` and, for external reporters, the contact fields

## Task

1. In `internal-create-page.tsx` add state for reporter kind (`external`
   default), internal user id, channel (`phone` default), report time
   (`datetime-local`, initialised to local now) and existing contact fields.
2. Add a small `useReporterUsers` query against `/v1/tickets/reporter-users`
   that only runs while the internal kind is selected. Reuse the bounded picker
   pattern of `ObjectPicker` or render a scrollable `<select>`; internal
   selection fills name and e-mail from the answer and keeps phone editable.
3. Render three labelled sections with headings: `Meldender` (radio plus either
   user picker or name/phone/e-mail inputs), `Meldezeit` (input, hint that the
   default is now), `Meldungskanal` (three radios, same `name`, one choice).
4. Convert the local `datetime-local` value with `new Date(value).toISOString()`
   and send it as `reportedAt`; disable the submit button while the field is
   empty. Do not send a future timestamp — the server rejects it and the form
   maps `invalid_request` to the existing input-check hint.
5. Add the German and English keys under `internal.create.fields`.
6. Extend the page test: default report time is present, only one channel can be
   selected, switching to internal shows the picker, and the posted body carries
   `reporterChannel`, `reporterKind` and `reportedAt`.

## Non-goals

- No timeline or detail changes (WP-M2-98d, WP-M2-98e).
- No public QR form change.
- No new component library, no new permission.

## Acceptance

```bash
npm run wp:check
npm run check
```

Expected: all green, including `i18n:check` key parity and the page test.

## Handoff

- Files changed: form, both locale files, page test
- Interfaces added: the three form sections and the extended request body
- Verified: `npm run wp:check`, `npm run check`
- Follow-up WP: WP-M2-98d, WP-M2-98e
- Open question: none
