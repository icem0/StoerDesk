# WP-M31-12: the administration of the action and of the templates of the portal

format: ctx-256k
status: planned
depends-on: WP-M31-11
phase: 31
milestone: m31
context-budget: 45k tokens
spec: specs/19-customer-portal.md §19.8 (the action), §19.3 (the mails of the portal)
spec-lines: 20
changed-lines: 320

files-read:

- specs/19-customer-portal.md §19.3 (the mails), §19.8 (the action)
- apps/web/src/admin/escalation-action-editor.tsx (the editor of the actions)
- apps/web/src/admin/email-page.tsx (the mailbox of the instance)
- apps/api/src/notifications/channels/index.ts (the templates of the channel)
- apps/api/src/customers/mail.ts (the mails of the portal)
- apps/web/src/i18n/locales/de/settings.json (the texts of the administration)

files-write:

- apps/web/src/admin/escalation-action-editor.tsx
- apps/web/src/admin/email-page.tsx
- apps/api/src/customers/mail.ts
- apps/api/src/notifications/channels/index.ts
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json
- apps/web/src/features/objects/object-edit-page.tsx
- apps/web/src/features/objects/object-create-page.tsx
- apps/web/src/features/objects/**tests**/object-form-priority.test.tsx
- apps/web/src/features/tickets/**tests**/report-form-page.test.tsx

interfaces:

- the action type `notify_reporter` in the editor of the actions
- the templates `registration`, `password_reset` and `customer_ticket` of the mailbox

## Task

1. **The editor of the actions** carries the new type `notify_reporter`: it
   carries no configuration — the recipient is the address of the reporter and
   his opt-in decides whether the mail goes out.
2. **The mailbox** `/admin/email` offers the three new templates: the
   registration, the forgotten password and the report of the reporter. Without
   a template the built-in text of the kind is used.
3. **The channel** and the **module of the mails** carry the three templates.
4. **The tests** of the object form and of the report form learn the changes:
   the priority of the object has an accessible name (the page carries a second
   select for the trained people), and the report form confirms the trained
   person.

## Non-goals

- No change of the other actions and no change of the other templates.
- No new page of the administration.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the changed tests fail before the change and pass after it.

## Handoff

- Files changed: the editor of the actions, the mailbox, the channel, the
  module of the mails, the texts, the two object pages and the two tests
- Interfaces added: the action type and the three templates
- Verified: the commands above
- Follow-up WP: WP-M31-13 — the criterion and the documentation of the phase
- Open question: none
