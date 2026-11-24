# WP-M24-17: the mailbox of the instance in `/admin/email`

format: small-model
status: done
depends-on: WP-M24-16
phase: 24
milestone: m24
context-budget: 18k tokens
spec: specs/10-notifications.md §11.5, §11.5a, §11.12, ADR-0046
spec-lines: 50

files-read:

- apps/web/src/admin/channels-page.tsx (the administration of the channels)
- apps/web/src/notifications/routes.ts (the routes of the channels)
- apps/api/src/notifications/channels/email.ts (the adapter of the mail)

files-write:

- apps/web/src/admin/email-page.tsx, apps/web/src/routes/index.tsx, apps/web/src/settings/settings-page.tsx
- apps/api/src/notifications/channels/email.ts, apps/api/src/notifications/channels/index.ts
- packages/shared/src/schemas/notification.ts

interfaces:

- `GET|PATCH /api/v1/admin/channels/email` — the mailbox of the instance (the row of the channel)
- `POST /api/v1/admin/channels/email/test` — the test mail to an address
- `renderHtmlBody(config, message, pwaUrl)` — the body of the mail as HTML

## Task

1. Write the page `/admin/email`: the SMTP connection, the sender with its
   display name, the templates of the messages per kind, the test mail to an
   address and the entry of the settings menu.
2. The row of the channel wins over the environment for the mail: the SMTP
   connection, the sender and the templates are read from the row.
3. The body of every mail is **HTML** with the ticket link: the template of the
   kind of the message, the empty lines as paragraphs, the values escaped and
   the deep link as a link (§11.5, §11.5a).

## Non-goals

- No incoming mail — out of scope.
- No delivery log of the mails in this WP.
- No change of the other channels.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the test of the adapter proves the HTML body with the
escaped values and the link.

## Handoff

- Files changed: the page of the mailbox, the routes, the menu, the adapter of
  the mail, the registry, the shared contracts
- Interfaces added: the page `/admin/email`, the renderer of the HTML body
- Verified: the commands above
- Follow-up WP: WP-M24-18 — the rule and the channels of the users in the administration
- Open question: none
