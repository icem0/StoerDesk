# 10 — Notifications

**Chapter:** 11 (notifications)
**Scope:** ~190 lines
**Status:** reviewed for phase 14 (WP-M14-03), amended for the readiness rules of
WP-M14-26 (ADR-0021) and for the way of the escalation (WP-M17-00, ADR-0037)

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

**The VAPID trio of the web push is one value.** The public key, the private key
and the subject of the web push belong together: the browser subscribes with the
public key, the server signs with the private key, and the push service accepts
a send only when both belong to the same pair. The row of the administration
therefore wins over the environment **as a whole** — a row that carries the
public key, the subject *and* the secret replaces the trio of the environment,
a row that carries only a part of it leaves the trio of the environment
untouched. A public key of the row beside a private key of the environment is a
pair that does not belong together: every send of it fails at the push service
with `403` and the delivery fails with `send_failed` (WP-M14-170).

For **ntfy** the secret is the **access token of the server** (ADR-0022): a
self-hosted server or a server with access control refuses a publish without
one. The row's `secret` with the `NTFY_TOKEN` environment fallback is handed to
the send and travels only in the `Authorization: Bearer` header of the publish
request — never in the URL, never as a `?token=` query parameter, never in a
log, an answer or an error text. A missing or wrong key is a failing send
(`http_401`, `http_403`), not a broken channel configuration; the key is not
part of the target fingerprint.

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
- **Web Push:** the device of a browser is the row of the table
  `push_subscriptions`; the endpoint is the identity of the browser, a repeated
  subscription replaces the old row and a shared device belongs to the user who
  subscribed last. The route
  `POST /api/v1/notifications/accounts/webpush/check` answers whether the
  server still holds the row of this device of this user: the browser knows its
  own subscription, the server knows its rows, and only both together say
  whether a push can arrive (WP-M14-144). The endpoint is a capability URL — it
  travels in the body of the request and never in an answer and never into a
  log line.

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
notified through the channels of the instance (the chain of §11.1) — the
exception is an escalation that names the user as its recipient: it arrives on
their own ntfy topic (ADR-0037). Migration
`0034` widens the event check of that table to the seven types (ADR-0021).

The precedence of the rules is fixed:

1. The **escalation rule** of the admin decides **whether** and **to whom** a
   `ticket.escalated` notification goes — the target of the action. It does not
   decide the way: a target names the recipient, the recipient decides the
   channel (§11.4 rule 2, ADR-0037). Only a `notify` action **without** a
   target takes the channels of the installation — that action is the broadcast.
2. The **selection of the user** decides the channels of `ticket.created`,
   `ticket.assigned` and `ticket.resolved` as well as the three readiness
   events — and the channels of a `ticket.escalated` that names the user as its
   recipient (ADR-0037). A user without a row for that event type is notified
   over their own ntfy topic.
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
event `notification_sent`. A publish request that never answers within the
timeout of the adapter ends as the code `http_timeout` (WP-M14-53) and follows
the same retry and fallback rule — a silent server never holds the drain open.

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

Both notification events name the configuration that queued the row next to the
channel: the payload carries the key of the rule and the key of the stage of the
escalation that produced the row (§7.5), the name of the addressee of a personal
delivery (§11.3, §11.16 — given and family name, the e-mail only as the
fallback) and the name of the target the action was configured for (§7.5, a
readiness pool or a user). The ticket history renders these names, so the office
sees where a message went and which escalation level sent it; without them a row
of „Benachrichtigung gesendet“ names nobody and nothing (WP-M14-152). The names
are display names of the installation — no topic, no token, no address and no
contact value ever enters the payload.

A warning that only lives in a list of a page is not a warning: the failing
channels are shown in the settings menu of the administrator as well, until the
channel works again.

### The quittature of a delivery problem

A failed delivery is a **problem of the channel** until somebody has seen it.
The administration *quits* it, and the warning is silent until the next
failure:

- the badge of the settings menu **is a link**: it leads to the page
  `/admin/delivery`, where the admin sees which channel fails, since when,
  with which machine code and which messages never arrived,
- the badge counts the channels with a failure that nobody acknowledged,
- the quittature stores the **time** of the acknowledgement — the `settings` row
  `notifications.delivery_acknowledged` with one entry per channel. Every
  failure after that time is a new failure and opens the problem again: a
  solved problem stays solved and a new one is never silent,
- the acknowledgement belongs to the instance and not to a user: the next admin
  sees the same state. The user that acknowledged is named next to the time,
- `notification.write` acknowledges, `notification.read` reads the problems,
- the quittature never deletes a failed row: a message that never arrived stays
  lost and stays visible.

The time of a failure is the time the delivery failed — the `updated_at` of the
row of the outbox — and not the time the row was queued. A delivery that was
queued before the quittature and failed after it is a new failure.

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
| `GET /api/v1/notifications/delivery` | `notification.read` | the delivery problems and the lost messages (§11.8) |
| `POST /api/v1/notifications/delivery/acknowledge` | `notification.write` | the quittature of the problems (§11.8) |
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
- `/admin/delivery` — the delivery problems (§11.8): the failing channels with
  the time of the last failure, the machine code and the number of the
  unacknowledged failures, the messages that never arrived and the quittature
  of the problems.
- `/settings/notifications` — the own channels: the linked accounts (Telegram,
  Matrix, ntfy, WhatsApp Web), the subscription QR of ntfy and the selection of
  the channels per event type, the seven event types of §11.4 (ADR-0021).
- Both pages are entries of the settings menu (§14 of `PLAN.md`). Each page links
  to the other exactly once: the administration names the own page
  (`admin.channels.verification.personalLink`, WP-M14-48) and the own page names
  the administration (`notifications.administration.link`, WP-M14-54) — the link
  carries no permission check and the two layers stay apart.

**The state of the push in the browser.** The card of `/settings/notifications`
and the inbox of `/notifications` ask **this browser** for its own push
subscription — never the account of the user on the server. A browser without a
push manager, a browser with a blocked permission, a browser without a
subscription and a browser that does not answer are four different states, and
the UI names the state it found instead of a general claim: a statement about
the browser that was never checked is a lie (WP-M14-142).

## 11.13 The security

- The secrets of the channels and of the accounts are write-only: never
  answered, never logged, never part of an event payload. The access token of
  the ntfy server (ADR-0022) travels only in the `Authorization` header.
- The messages carry no contact data of the reporter and no photo.
- The Telegram code expires after ten minutes and is used once.
- The bridge bearer of WhatsApp Web and the Matrix token travel only over the
  API of the instance and are never shown to a user without the right to write.
- The bridge of WhatsApp Web is a service of the operator; the Compose stack of
  StörDesk gains no service for it.

## 11.14 The tests

- a unit test per adapter: the payload, the error code and the secret that
  never appears in a message,
- the access token of the ntfy server (ADR-0022) reaches the test send, the
  verification code and the drain in the `Authorization` header and never an
  answer or a log,
- an integration test of the outbox: the account of a user is used, the
  selection of the user decides the channels, the mandatory minimum channels of
  a critical ticket are notified, a failure falls back to the next channel,
- the exit criterion of the phase proves the three rules of §11.4, the warning
  of §11.8 and the readiness rule of ADR-0021: the allocation of a technician
  notifies that technician over the channels they selected, and a `DRAFT`
  readiness answers a confirm.

## 11.15 The health of the channels

The status of §11.8 shows what happened last. The health of a channel is the
question whether it delivers **now**: a channel is *broken* when its last
delivery failed and no delivery of it succeeded since.

**The dead subscription of the web push.** The push service answers `404` or
`410` for an endpoint that no longer exists — the browser revoked the
notification permission, the browser was reinstalled or the subscription
expired. Such an endpoint is *dead*: the adapter names it with the code
`push_subscription_dead`, the channel removes the row of `push_subscriptions`
and the row of the outbox carries that code as its `lastError` (§11.8). A
delivery that reaches at least one live device removes the dead rows of the
same send; a send where **every** device is dead fails with that code, so the
chain of §11.1 falls back to the next channel.

**The codes of a failing web push.** A send of the web push that fails names
its cause: keys that do not belong together fail with `vapid_key_mismatch`
before the request, a rejected authorization of the push service (`401`,
`403`) with `push_unauthorized`, another answer of the push service with
`push_rejected` and a request without an answer with `push_unreachable`. The
code travels into the `lastError` of the row of the outbox (§11.8) and into
the log of the API — never the endpoint of a device, never a key (WP-M14-171).

**The warning over another channel.** A broken channel warns the
administration **once a day over another channel**: the daily check enqueues
one row of the event type `channel.health_warning` for the first configured
channel of the chain of §11.1 that is not the broken one. The warning never
goes to the broken channel and never falls back further — the warning itself
is the last word about the channel. The text names the broken channel and the
machine code of its last failure, is translated (de/en) and carries no
emergency number (`PLAN.md` §2). At most one warning per broken channel and
per day; a channel that works again is silent.

**The instance row.** A warning row belongs to no ticket and to no shift: it
carries the event type `channel.health_warning`, no ticket, no shift and no
personal message. The checks of the `outbox` table know that shape.

## 11.16 The admin view of the inbox

The inbox of a user is **personal**: the page `/notifications` and the bell of
the shell show and count only the messages of the signed-in user. That is the
promise of the inbox — a user reads what StörDesk sent to them.

The office asks for a second view on the same page: a filter that shows **which
message arrived at which user**. The right to it is a permission of its own:

| Permission | Meaning |
| --- | --- |
| `notification.read_all` | read the messages of **other** users |

The key belongs to no default role — the administration assigns it to a role
over the role API (`specs/01-rbac.md` §3.8), `admin` holds it through the
catalogue. Without the key the answer of the API stays the own messages, the
addressee of a row is `null` and the list of the addressees is empty; a request
for the messages of another user answers `403 forbidden`.

### The filters

`GET /api/v1/notifications/messages` reads the filters of the query:

| Filter | Meaning |
| --- | --- |
| `userId` | the addressee of the message; a foreign id without the permission answers `403 forbidden` |
| `channel` | the channel of the message |
| `eventType` | the event type of the message (§11.4) |
| `state` | the state of the delivery (`PENDING`, `SENT`, `FAILED`) |
| `unread` | `true` answers the messages without a read receipt |

The filters `channel`, `eventType`, `state` and `unread` narrow the own inbox
and are allowed for every session; only the filter of the addressee needs the
permission. An unknown value answers `400 invalid_request` with the field path.

### The answer

Every row carries its addressee (`{ userId, name }` — the name of the user,
else the e-mail) and the answer carries the list of the addressees with the
number of their messages. The list applies every filter **except** the filter of
the addressee, so it stays complete while a filter is active.

The read receipt stays a right of the own messages: a message of another user
cannot be marked as read (the route answers `404 message_not_found`). The bell
and the unread count stay personal — the admin view never changes what a user
sees in the bell.
