# WP-M33-01: the templates carry a standard text

format: ctx-256k
status: done
phase: 33
milestone: m33
context-budget: 20k tokens
depends-on: WP-M24-19 (the mailbox of the instance at /admin/email), ADR-0046
spec: specs/10-notifications.md §11.5a; specs/19-customer-portal.md §19.3 and §19.8
spec-lines: 40
changed-lines: 72

files-read:

- apps/web/src/admin/email-page.tsx (the administration of the mailbox)
- apps/web/src/i18n/locales/de/settings.json (the texts of the administration)
- apps/api/src/notifications/channels/email.ts (the placeholders of a template, §11.5a)
- apps/api/src/notifications/outbox.ts (the machine values of a ticket and readiness message)
- apps/api/src/customers/mail.ts (the built-in texts of the portal mails)

files-write:

- apps/web/src/admin/email-page.tsx (a reset-to-standard button per template field)
- apps/web/src/i18n/locales/de/settings.json (the standard texts, German)
- apps/web/src/i18n/locales/en/settings.json (the standard texts, English)

interfaces:

- one button per template field of the mailbox — it fills the standard text of that field
- the localized standard text per kind of message — over `admin.email.standard.*`

## Task

1. The mailbox of the instance offers a standard text per kind of message —
   the ticket message, the readiness message, the test message, the registration,
   the new password and the report to the reporter. The text is a plain text with
   the placeholders of §11.5a; the machine values are only those the message of
   that kind carries (§11.5 and §19.8).
2. A button with the caption "Standard zurücksetzen" sits above every template
   field. It fills the localized standard text of that field into the field,
   following the language of the interface.
3. The standard texts and the caption of the button are added in German and
   English over `admin.email.standard.*` and `admin.email.standardReset`.

## Non-goals

- No change of the built-in fallback of the server or of the send path — an
  empty field still uses the built-in text.
- No change of the placeholders, the escaping or the channel contract.
- No automatic saving — the reset fills the field; the existing save sends it.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run i18n:check
npm run wp:check
npm run test:run
```

Expected: all green; `i18n:check` proves the seven new keys exist in `de` and in
`en`; the mailbox keeps rendering its six template fields and one reset button
above each of them.

## Handoff

- Files changed: the three files of `files-write`, plus CHANGELOG.md,
  docs/REPO-MAP.md, PLAN.md §16, work-packages/README.md
- Interfaces added: the reset-to-standard button per field, the localized
  standard text per kind of message
- Verified: `npm run check` green (typecheck, lint, i18n, wp, the tests of the
  API and the web, the E2E of the browser)
- Follow-up WP: none — the phase is closed
- Open question: none
- Notes: the button fills the field only (no save); the values the reset writes
  are plain texts with the placeholders of §11.5a and escape on the server
  before they enter the HTML (ADR-0046). The customer-portal texts carry the
  deep link inside the text because the portal mails send no automatic link.
