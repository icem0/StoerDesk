# 10 — Notifications

**Chapter:** 11 (notifications)
**Scope:** ~190 lines
**Status:** reviewed for phase 14 (WP-M14-03), amended for the readiness rules of
WP-M14-26 (ADR-0021)

The binding summary is `PLAN.md` §12. This slice defines the channels of the
outbox, where their configuration lives, how a user links an account, which
channels are notified for which event, what a message contains and how a failed
channel becomes visible. The adapters of phase 7 stay; phase 14 gives them a
configuration, a target and a rule.

## 11.1 The channels

| Kind | Transport | Target | Linked account |
| --- | --- | --- | --- |
| `signal` | external `signal-cli` bridge (HTTP RPC) | the recipients of the instance | no |
| `matrix` | external homeserver (client-server API) | the room of the configuration | yes — a token per user |
| `ntfy` | external ntfy server | the topic of the configuration or the topic of the user | yes — a topic per user |
| `email` | external SMTP server | the recipients of the instance | no |
| `telegram` | Telegram Bot API | the chat of the configuration or the chat of the user | yes — a one-time code |
| `webpush` | Web Push (VAPID) | the subscriptions of the users | yes — a subscription per user |
| `whatsapp` | external WhatsApp bridge (ADR-0020) | the chat of the configuration or the chat of the user | yes — a chat id |

A channel is **configured** when it has a usable configuration **and** its
target was confirmed. For `ntfy`, the confirmation is a one-time code that the
API sends to the topic and the admin enters back (§11.2); until then the channel
is shown as *unverified* and produces no outbox row. The other kinds have no
verification step yet and count as confirmed when usable. A channel that is not
configured never appears in the chain and never produces an outbox row. The
order of the table is the order of the fallback chain: the first channel that is
configured is the first one that is tried.

## 11.2 Where the configuration lives

The configuration of a channel lives in the row of the table
`notification_channels` with that kind:

| Field | Meaning |
| --- | --- |
| `kind` | the machine key of the channel, unique |
| `enabled` | the admin switched the channel off |
| `label` | the name shown in the administration and in the messages |
| `config` | the public settings of the channel (url, room, topic, homeserver …) |
| `secret` | the write-only secret of the channel (bot token, access token, bridge bearer) |

The environment is the **fallback**: a kind without a row in the table keeps its
values of the environment (`NTFY_URL`, `MATRIX_ACCESS_TOKEN`, …). A row in the
table wins over the environment, so an instance can be switched from one
configuration to the other without a restart of the API.

The rule of ADR-0005 applies to every secret: it is write-only, never answered
by the API, never written into a log and never shown in the administration. The
administration answers `secretSet: boolean` instead.

### Proof of the target

`notification_channel_verifications` keeps one row per kind: the fingerprint of
the confirmed target (its required public settings), the pending one-time code
with its ten-minute deadline and `verified_at`. `POST
/api/v1/admin/channels/ntfy/verification` sends a six-character code to the
effective target and stores it; `POST
/api/v1/admin/channels/ntfy/verification/confirm` sets `verified_at` only when
the code and the fingerprint of the current target match. A changed
configuration therefore never inherits an old proof.

Only a verified `ntfy` target receives outbox rows. The admin test send and the
verification code itself use the stored configuration and do not require the
proof — otherwise the first code could never be sent. The administration reports
`verified: boolean` next to `enabled`; a channel with usable settings but no
proof is *unverified*, never *configured*.

## 11.3 The accounts of the users

`notification_accounts` holds the link between a user and a channel:

| Field | Meaning |
| --- | --- |
| `user_id` | the user of StörDesk |
| `channel` | the kind of the channel |
| `external_id` | the address at the channel (chat id, matrix id, topic, chat id of the bridge) |
| `label` | the name the user gave the account |
| `secret` | the write-only secret of the account (the Matrix access token) |

A user has at most one account per channel (`unique (user_id, channel)`).

- **Telegram:** the settings page asks the API for a one-time code (six
  characters, ten minutes). The user sends the code to the bot; the API reads
  the pending updates of the bot, matches the code and stores the chat id.
- **Matrix:** the user enters the homeserver, the matrix id and an access token.
  The API verifies the pair with `GET /_matrix/client/v3/account/whoami` before
  it stores the account.
- **ntfy:** the topic of a user is derived from the user id
  (`stoerdesk-<userId>`), the administration answers the subscription address
  and the settings page shows it as a QR code.
- **WhatsApp Web:** the bridge owns the session and the pairing; StörDesk reads
  the chats of the bridge (`GET /status`) and stores the chat id of the user.

## 11.4 The event types and the selection of the channels

The event types of the notification are fixed:

| Event type | Fires when |
| --- | --- |
| `ticket.created` | a report creates a ticket (the public QR form and the internal creation) |
| `ticket.assigned` | a ticket is assigned to a person or offered to the on-call person |
| `ticket.escalated` | an escalation rule fires |
| `ticket.resolved` | a ticket is acknowledged or closed |
| `oncall.assigned` | a readiness shift is allocated to a technician |
| `oncall.swap_requested` | a swap is requested on the own confirmed shift |
| `oncall.unconfirmed_reminder` | a shift still waits for a decision within `oncall.reminder_unconfirmed_h` |

`notification_preferences` holds the selection of a user: one row per
`(user_id, event_type, channel)`. A user without a row for an event type is
notified through the channels of the instance (the chain of §11.1). Migration
`0034` widens the event check of that table to the seven types (ADR-0021).

The precedence of the rules is fixed:

1. The **escalation rule** of the admin decides the channels of
   `ticket.escalated` — the selection of the user does not change it.
2. The **selection of the user** decides the channels of `ticket.created`,
   `ticket.assigned` and `ticket.resolved` as well as the three readiness
   events.
3. The **mandatory minimum channels** of the admin (§11.9) are added to every
   event of a critical ticket. They cannot be switched off by a user.

## 11.5 The content of a message

A ticket message carries the ticket number, the priority, the object name and its
location, the system type, the short text of the report, the AA/SA number if
there is one and the deep link into the ticket. A readiness message carries the
pool name, the start and the end in `Europe/Berlin`, the state of the shift and
the deep link to `/oncall` (ADR-0021). Neither message carries a photo or the
contact data of a reporter.

ntfy receives the priority of the ticket through the JSON publish API
(`POST /` with the topic in the body) as the numeric value `5` (max, the
`urgent` level) for a critical ticket and `3` (default) otherwise; the `view`
action uses the JSON field `url` and is omitted when there is no deep link.
Telegram, Matrix, WhatsApp Web, Signal and e-mail
receive the same text; the deep link is labelled with the text of the interface
of the recipient.

## 11.6 WhatsApp Web over an external bridge

ADR-0020 decides the transport: StörDesk speaks a small HTTP contract to a
bridge that the operator runs, it ships no browser and no WhatsApp session.

| Call | Meaning |
| --- | --- |
| `POST {baseUrl}/messages` | `{ chatId, text }` with the bearer of the bridge; `202` means accepted, `4xx`/`5xx` is a failure |
| `GET {baseUrl}/status` | `{ connected: boolean, chats: [{ id, label }] }` |

The bridge URL and its bearer live in the configuration of the channel, the
chat id of a user lives in the account of the user. A missing bridge means:
the channel is not configured.

## 11.7 The delivery

The delivery keeps the rules of phase 7: the outbox row is written in the
transaction of the ticket event, the worker claims the oldest row, the send is
tried three times with a backoff, an exhausted row ends as `FAILED` with the
event `notification_failed`, and the next channel of the chain is queued as a
fallback in the same transaction. The successful row ends as `SENT` with the
event `notification_sent`.

The row of the outbox carries the event type of §11.4 next to its channel, so
the status view can tell a new ticket from an escalation. A readiness row
carries `shift_id` instead of `ticket_id` (ADR-0021): exactly one of the two is
set, and the worker builds the readiness message of §11.5 for it. The
`oncall.unconfirmed_reminder` rows are written by the per-minute escalation scan
for a `PLANNED` or `DRAFT` shift that starts within
`oncall.reminder_unconfirmed_h` and has no such row yet — one reminder per shift.

## 11.8 The status and the warning on a failure

The status of a channel is the number of pending rows, the number of failed
rows, the time of the last success and the time of the last failure. The
dashboard tile shows it today; phase 14 gives the administration the same
numbers.

The admin sees a failed channel in three places:

- the channel page `/admin/channels` lists the failing channels with the time
  of the last failure,
- the tile of the dashboard shows the badge "delivery disturbed",
- the ticket history carries the event `notification_failed` with the channel
  and the number of attempts.

A warning that only lives in a list of a page is not a warning: the failing
channels are shown in the settings menu of the administrator as well, until the
channel works again.

## 11.9 The mandatory minimum channels of critical tickets

The setting `notifications.minimum_channels` holds the list of the channel
kinds that every critical ticket is notified through, whatever the selection of
the user says. The list is empty by default — the admin decides.

The list may only name channels that are configured. A channel of the list that
is not configured is refused with `422 invalid_request`, so the setting never
promises a delivery that cannot happen.

## 11.10 The data model

| Table | Change |
| --- | --- |
| `notification_channels` | the columns `kind` (unique), `enabled`, `label`, `config` (jsonb) and `secret` (write-only) |
| `notification_accounts` | new: the accounts of the users (§11.3) |
| `notification_preferences` | new: the selection of the channels per event type (§11.4) |
| `outbox` | the column `event_type` (check over the seven types) and the column `shift_id` (FK to `oncall_shifts`, cascade, nullable); `ticket_id` becomes nullable with the check that exactly one of the two is set (ADR-0021, migration 0034) |
| `settings` | the row `notifications.minimum_channels` (§11.9) |

## 11.11 The API

| Route | Permission | Meaning |
| --- | --- | --- |
| `GET /api/v1/admin/channels` | `notification.read` | the channels with their state, their public configuration and `secretSet` |
| `PATCH /api/v1/admin/channels/:kind` | `notification.write` | the configuration of a channel; a secret is write-only |
| `POST /api/v1/admin/channels/:kind/test` | `notification.write` | sends a test message and answers `{ delivered }`; an optional body `{ topic }` overrides the test target (for example an ntfy test topic) |
| `GET /api/v1/notifications/status` | `notification.read` | the status of every channel (§11.8) |
| `GET /api/v1/notifications/accounts` | session | the own accounts |
| `POST /api/v1/notifications/accounts/telegram/code` | session | a one-time code for the Telegram bot |
| `POST /api/v1/notifications/accounts/telegram` | session | the code is checked, the account is stored |
| `POST /api/v1/notifications/accounts/matrix` | session | the homeserver, the matrix id and the token are verified and stored |
| `DELETE /api/v1/notifications/accounts/:channel` | session | the own account of a channel is removed |
| `GET /api/v1/notifications/preferences` | session | the own selection of the channels |
| `PUT /api/v1/notifications/preferences` | session | the own selection of the channels |

## 11.12 The UI

- `/admin/channels` — the administration of the channels: the state of every
  channel, the configuration, the write-only secret, the test message and the
  failing channels with the time of the last failure.
- `/settings/notifications` — the own channels: the linked accounts (Telegram,
  Matrix, ntfy, WhatsApp Web), the subscription QR of ntfy and the selection of
  the channels per event type, the seven event types of §11.4 (ADR-0021).
- Both pages are entries of the settings menu (§14 of `PLAN.md`).

## 11.13 The security

- The secrets of the channels and of the accounts are write-only: never
  answered, never logged, never part of an event payload.
- The messages carry no contact data of the reporter and no photo.
- The Telegram code expires after ten minutes and is used once.
- The bridge bearer of WhatsApp Web and the Matrix token travel only over the
  API of the instance and are never shown to a user without the right to write.
- The bridge of WhatsApp Web is a service of the operator; the Compose stack of
  StörDesk gains no service for it.

## 11.14 The tests

- a unit test per adapter: the payload, the error code and the secret that
  never appears in a message,
- an integration test of the outbox: the account of a user is used, the
  selection of the user decides the channels, the mandatory minimum channels of
  a critical ticket are notified, a failure falls back to the next channel,
- the exit criterion of the phase proves the three rules of §11.4, the warning
  of §11.8 and the readiness rule of ADR-0021: the allocation of a technician
  notifies that technician over the channels they selected, and a `DRAFT`
  readiness answers a confirm.
