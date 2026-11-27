# WP-M46-02: the channel settings save what was typed

format: ctx-256k
status: planned
depends-on: WP-M46-01
phase: 46
milestone: m46
context-budget: 40k tokens
spec: specs/13-ui.md §14.14
spec-lines: 30
changed-lines: 360

files-read:

- PLAN.md §3, §4.1, §17, §18
- specs/13-ui.md §14.14
- apps/web/src/admin/channels-page.tsx (the policy and the alarm sections)
- apps/web/src/admin/email-page.tsx (the SMTP connection)
- apps/web/src/admin/channel-form-parts.tsx (the field list of the email channel)
- apps/web/src/admin/escalation-page.tsx (the save bar of WP-M46-01, to reuse its pattern)
- apps/web/src/i18n/locales/de/settings.json, en/settings.json

files-write:

- apps/web/src/admin/channels-page.tsx
- apps/web/src/admin/email-page.tsx
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json
- apps/web/src/admin/**tests**/channels-page.test.tsx
- apps/web/src/admin/**tests**/email-page.test.tsx

interfaces:

- the sections „Die Vorgabe der Administration“ and „Der Alarm der Instanz“ of
  `/admin/channels` hold a draft and save it with one „Speichern“ per section
  (§14.14); a number field never sends a request on its own
- the field „Verschlüsselt“ of `/admin/email` is a checkbox; the stored value
  stays the string `'true'`/`'false'` of the channel config

## Task

The review of 2026-11-27 changed „Der Ton kommt wieder (Sekunden)“ key by key
from 60 to 120 on a live instance. The page sent five
`PUT /api/v1/settings/notifications/alarm`, four of them answered `400`, and
the stored value was **600**: the input is bound to the query data, so every
keystroke builds on the old value, and `Number(value) || 60` turns an empty
field into 60. The error vanished with the next success. „Mindestanzahl
eingerichteter Kanäle“ is built the same way. The SMTP field „Verschlüsselt
(true/false)“ is a free text field the administrator must type `true` into.

1. `channels-page.tsx`, policy section: a local draft of
   `requiredChannels` and `minimumChannelCount`, seeded from the query. The
   checkboxes and the count change the draft; one „Speichern“ button,
   enabled while the draft differs, sends one `PUT`. The count accepts an
   integer from 0 to the number of channels and marks an invalid value
   (`aria-invalid`) instead of sending it.
2. Alarm section: the same draft and button for `toneEnabled` and
   `repeatSeconds`; the field accepts 15–600 and marks a value outside
   instead of substituting 60.
3. Both sections show „Wird gespeichert …“ and „Gespeichert“ beside the
   button and keep the error of the answer until the next edit.
4. `email-page.tsx`: „Verschlüsselt“ becomes a checkbox with the hint of the
   ports (465 encrypted at once, 587 upgraded on the way); the draft writes
   `'true'`/`'false'` so the API contract is unchanged.
5. i18n `de`/`en`: the save, saving and saved texts of both sections, the
   label „Verschlüsselte Verbindung (SSL/TLS)“ and the port hint.
6. Tests: typing `120` key by key sends no request and the field shows `120`;
   „Speichern“ sends one `PUT` with `repeatSeconds: 120`; `5` is marked and
   not sent; the policy count behaves the same; the email checkbox saves
   `'true'`.

## Non-goals

- No change of the API routes or of their validation.
- No change of the user channel table of the same page.
- No restyle of the inputs beyond the invalid mark.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the test „typing 120 sends no request“ fails before the
change.

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: none
- Open question (if any):
