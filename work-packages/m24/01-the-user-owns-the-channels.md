# WP-M24-01: the user owns the channels, the administration names the reach

format: small-model
status: done
depends-on: WP-M23-03
phase: 24
milestone: m24
context-budget: 20k tokens
spec: specs/10-notifications.md §11.1, §11.3, §11.3a, §11.4, §11.5, §11.5a, §11.7, §11.9, §11.10, §11.11, §11.12, §11.13
spec-lines: 190

files-read:

- specs/10-notifications.md (the contract of the chapter)
- docs/DECISIONS/0037-the-recipient-chooses-the-way-of-the-escalation.md (ADR-0037)
- apps/api/src/notifications/preferences.ts (the selection per event type)
- apps/api/src/settings/notifications.ts (the setting of the mandatory channels)
- apps/web/src/settings/notifications-page.tsx (the own page with the seven switches)
- apps/api/src/notifications/channels/email.ts (the mail without a recipient)

files-write:

- docs/DECISIONS/0045-the-user-owns-the-channels.md
- docs/DECISIONS/0046-the-mailbox-of-the-instance.md
- specs/10-notifications.md
- PLAN.md

interfaces:

- `notifications.required_channels` — the setting row: the channel kinds every user must have set up
- `notifications.minimum_channel_count` — the setting row: how many channels a user must have set up
- `POST /api/v1/notifications/accounts/:channel/verification` — sends the one-time code over the channel of the account
- `POST /api/v1/notifications/accounts/:channel/verification/confirm` — confirms the account with the code
- `GET|PUT /api/v1/settings/notifications/channel-policy` — the rule of the administration
- `GET /api/v1/admin/notifications/compliance` — the users and their channels

## Task

1. Write **ADR-0045**: a user has channels, not a selection per event type. The
   account of a user counts only when it is confirmed by a one-time code over
   the channel itself; the administration names the required channels and the
   minimum number of channels; the rule warns and never blocks; `signal` may
   never be a required channel.
2. Write **ADR-0046**: the mailbox of the instance is administered in
   `/admin/email` — the SMTP connection, the sender with a display name, the
   templates per kind of message, the HTML body, the broadcast to the mail
   addresses of the users and the log of the deliveries.
3. Rewrite the chapters of `specs/10-notifications.md`: the two levels of a
   channel (§11.1), the confirmation of an account (§11.3a), the channels of the
   user instead of the selection (§11.4), the HTML mail and its templates
   (§11.5, §11.5a), the delivery over the channels of the user (§11.7), the
   required channels and the minimum number instead of the mandatory channels of
   the critical tickets (§11.9), the data model (§11.10), the routes (§11.11),
   the pages (§11.12) and the rules of the security (§11.13).
4. Adapt **PLAN.md** §12 to the new model.

## Non-goals

- No code, no migration, no route in this WP — the spec decides, the code follows.
- No change of the adapters and of the outbox.
- No incoming mail (IMAP) and no customer mail.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the spec, the two ADRs and the plan name the same model.

## Handoff

- Files changed: the two ADRs, the spec of the notifications, PLAN.md §12
- Interfaces added: the two settings of the rule, the two routes of the
  confirmation, the route of the policy, the route of the compliance
- Verified: the commands above
- Follow-up WP: WP-M24-02 — the migration of the accounts and the end of the
  selection per event type
- Open question: none
