# WP-M14-45: ntfy delivers the selected events to the topic of the user

format: small-model
status: done
depends-on: WP-M14-13, WP-M14-16, WP-M14-17
phase: 14
milestone: m14
context-budget: 18k tokens
spec: specs/10-notifications.md §11.3, §11.4, §11.5; PLAN.md §12
spec-lines: 45

files-read:

- specs/10-notifications.md §11.3, §11.4, §11.5
- apps/api/src/notifications/outbox.ts (the enqueue and the drain)
- apps/api/src/notifications/channels/ntfy.ts (the adapter)
- apps/api/src/notifications/preferences.ts (the selection of the user)
- apps/api/src/notifications/accounts.ts (the account of the user)
- apps/api/src/tickets/report.ts (the public create path)

files-write:

- apps/api/src/notifications/receivers.ts
- apps/api/src/notifications/outbox.ts
- apps/api/src/tickets/report.ts
- apps/api/src/notifications/__tests__/outbox.{unit,integration}.spec.ts

interfaces:

- `ntfyRecipients(database, eventType): Promise<string[]>` — the topics of the
  users who selected `ntfy` for the event
- `userTopic(userId): string` — `stoerdesk-<userId>` of §11.3
- `enqueueOutbox(database, ticket, env, eventType?)` — the event type of the row
- the outbox `target` may carry `ntfyTopic`; the drain passes it as the
  `options.topic` of `NotificationChannel.send`

## Task

The QR of the own channels page subscribes the phone to the topic of the user
(`stoerdesk-<userId>`, §11.3), but the outbox published to the configured
instance topic (`NTFY_TOPIC`) for every recipient. A phone that scanned the QR
therefore never received the ticket notification. This package connects the
selection of §11.4 to the send path.

1. New `receivers.ts`: `userTopic(userId)` derives `stoerdesk-<userId>`;
   `ntfyRecipients(database, eventType)` reads the `notification_preferences`
   rows of the event with `channel = 'ntfy'`, left-joins the ntfy account of the
   user and answers the account `external_id` when it is set, the derived topic
   otherwise — ordered, deduplicated, no secret and no contact value.
2. `enqueueOutbox` gains the event type (default `ticket.created`) and asks
   `ntfyRecipients` only when ntfy is configured. When it answers topics, the
   global ntfy row is replaced by one `ntfy` row per topic whose `target`
   carries `ntfyTopic`; the message params stay unchanged. Without a selection
   the instance chain is written exactly as before (the rule of §11.4). The
   minimum channels of a critical ticket never duplicate a per-user row.
3. `drainOutbox` reads `target.ntfyTopic` and passes it as `{ topic }` to
   `channel.send`, so the ntfy adapter publishes to the topic of the user
   (WP-M14-13); the other adapters ignore the option.
4. `report.ts` names `ticket.created` explicitly at the enqueue.
5. Unit tests prove the fallback row, the per-user rows with and without an
   account, and that a critical ticket does not duplicate the ntfy channel; an
   integration test proves that the drain publishes to `target.ntfyTopic`.

## Non-goals

- No change of the internal creation — it enqueues nothing yet (WP-M14-20).
- No Telegram, Matrix, WhatsApp or Web Push recipient routing — this package
  only moves the ntfy topic that the adapter already understands.
- No change of the adapter payload, the preference API or the QR.
- No auth/token support for a protected ntfy server.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; a user who selected `ntfy` for `ticket.created` receives
the message on `stoerdesk-<userId>`, a user without a selection keeps the
instance topic.

## Handoff

- Files changed: `receivers.ts`, `outbox.ts`, `report.ts`, the two outbox specs
- Interfaces added: `ntfyRecipients`, `userTopic`, the `eventType` argument and
  the `ntfyTopic` target field
- Verified: typecheck, lint, unit and integration tests, build
- Follow-up WP: WP-M14-20 — the internal creation enqueues its rows as well
- Open question: none
