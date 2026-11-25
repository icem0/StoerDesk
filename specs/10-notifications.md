# 10 — Notifications

**Chapter:** 11 (notifications)
**Scope:** ~190 lines
**Status:** reviewed for phase 14 (WP-M14-03), amended for the readiness rules of
WP-M14-26 (ADR-0021) and for the way of the escalation (WP-M17-00, ADR-0037),
rewritten for phase 24 (WP-M24-01, ADR-0045, ADR-0046), amended for the task
and the protocol (WP-M30-01, ADR-0052)

The binding summary is `PLAN.md` §12. This slice defines the channels of the
outbox, where their configuration lives, how a user links an account, how he
confirms it, which channels carry a message, what a message contains and how a
failed channel becomes visible. The adapters of phase 7 stay; phase 14 gives them
a configuration, a target and a rule; phase 24 gives the user the channels and
the administration the rule of the reach.

## 11.1 The channels

| Kind | Transport | Target | Linked account |
| --- | --- | --- | --- |
| `signal` | external `signal-cli` bridge (HTTP RPC) | the recipients of the instance | no |
| `matrix` | external homeserver (client-server API) | the room of the user or the room of the configuration | yes — a token and a room per user |
| `ntfy` | external ntfy server | the topic of the user or the topic of the configuration | yes — a topic per user |
| `email` | external SMTP server | the address of the user or the mail addresses of the instance | yes — an address per user |
| `telegram` | Telegram Bot API | the chat of the user or the chat of the configuration | yes — a one-time code |
| `webpush` | Web Push (VAPID) | the subscriptions of the users | yes — a subscription per user |
| `whatsapp` | external WhatsApp bridge (ADR-0020) | the chat of the user or the chat of the configuration | yes — a chat id |

A channel is **configured** when it has a usable configuration **and** its
target was confirmed. For `ntfy`, the confirmation is a one-time code that the
API sends to the topic and the admin enters back (§11.2); until then the channel
is shown as *unverified* and produces no outbox row. The other kinds have no
verification step yet and count as confirmed when usable. A channel that is not
configured never appears in the chain and never produces an outbox row. The
order of the table is the order of the fallback chain: the first channel that is
configured is the first one that is tried.

**Two levels of a channel.** Every kind has a target of the *installation* (the
room of the configuration, the chat of the configuration, the topic of the
configuration, the mail addresses of the instance) and a target of the *user*
(the room of the user, the chat of the user, the topic of the user, the address
of the user, the devices of the user). The target of the user belongs to the
account of the user (§11.3), the target of the installation belongs to the
configuration of the channel (§11.2). A message to a user goes over the target
of the user; the target of the installation is the fallback of the chain
(ADR-0045). `signal` has no target of the user — it is a channel of the
installation only and may never be named as a required channel (§11.9).

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
| `external_id` | the address at the channel (chat id, matrix id, topic, chat id of the bridge, mail address) |
| `label` | the name the user gave the account |
| `secret` | the write-only secret of the account (the Matrix access token) |
| `target` | the target of the user at the channel — the room of the user for Matrix, empty for every other kind |
| `verified_at` | the time of the confirmation of the account (§11.3a); null while the account is only linked |

A user has at most one account per channel (`unique (user_id, channel)`).

## 11.3a The confirmation of an account

A linked account is **linked**; it is **set up** only when the user proved that
the address works (ADR-0045). The proof is the same for every kind: the server
sends a one-time code (six characters, ten minutes) over the very channel of
the account and the user enters the code in the own page.

- `POST /api/v1/notifications/accounts/:channel/verification` sends the code
  over the target of the account and answers the deadline of the code — never
  the code itself. The code travels to the user over the channel, not over the
  API.
- `POST /api/v1/notifications/accounts/:channel/verification/confirm` takes
  the code the user copied. A correct code sets `verified_at`; a wrong code,
  an expired code and a code of another user are refused with
  `422 invalid_request`.
- A code is used once. A new code replaces the pending one.
- The address of the account is never answered in full: the own page names the
  kind of the address (a chat, a room, a topic, a mail address) and its last
  two characters are enough to recognise it.

A channel of a user that is linked but not confirmed is **not** used for the
delivery and does not count for the rule of §11.9. It is shown with the symbol
„linked, not confirmed“ — the difference between a channel that is there and a
channel that works.

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
  log line. **A device of an older key pair:** a subscription belongs to the
  VAPID key it was created with, and the push service refuses every send for a
  key pair the server does not own. When the server renews its keys, the
  browser keeps its subscription — `subscribe()` returns the subscription it
  holds — and the card of the settings page compares the key of the browser
  with the key of the server: the device is named and registered again, in the
  browser and on the server (WP-M14-172).

## 11.4 The event types and the channels of the user

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

Two event types belong to **no user**: the warning of a broken channel
(§11.15) and the task of a failed delivery (§11.18). They are instance events
— no user selects a channel for them, and they are written to the
administration alone.

**Every event goes over the channels of the recipient** (ADR-0045). The
channels of a user are the accounts he linked and confirmed (§11.3, §11.3a)
and the devices he registered for the web push. There is no selection per event
type any more: `notification_preferences` and its routes are removed, and the
question „which way for which event“ does not exist.

The precedence of the rules is fixed:

1. The **escalation rule** of the admin decides **whether** and **to whom** a
   `ticket.escalated` notification goes — the target of the action. It does not
   decide the way: a target names the recipient, the recipient's channels are
   the way (§11.4 rule 2, ADR-0037). Only a `notify` action **without** a
   target takes the channels of the installation — that action is the broadcast.
2. The **channels of the user** decide the way of `ticket.created`,
   `ticket.assigned` and `ticket.resolved` as well as of the three readiness
   events — and of a `ticket.escalated` that names the user as its recipient
   (ADR-0037). Only confirmed channels take part; a user without a confirmed
   channel is notified over the chain of the installation (the fallback of the
   delivery, §11.7).
3. The **rule of the administration** (§11.9) never decides the way of a
   message. It decides what a user must have set up — a rule the user sees as
   a warning, not as a switch of a channel (ADR-0045).

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
Telegram, Matrix, WhatsApp Web and Signal receive the same text; the deep link
is labelled with the text of the interface of the recipient.

**The urgency of a repeated reminder (WP-M23-09d).** A readiness message
carries the number of the reminder (WP-M23-09b). The first reminder arrives
like every other message; the second and every further one arrive louder: ntfy
receives the level `4` (high) for the second reminder and `5` (max, the
`urgent` level) for every further one, and the push of the browser carries the
urgency `high` — the push service delivers the message at once. The fallback
chain of §11.7 stays as it is: every channel of the chain receives the same
message.

**The e-mail is HTML** (ADR-0046). The body of every mail is HTML with the
deep link as a clickable link — a plain text mail is never sent. The text of
the mail comes from the template of the kind of the message (§11.5a); the
values of the placeholders are escaped before they enter the HTML, so a report
of a customer can never carry markup into the mail of the office.

## 11.5a The templates of the e-mail

The mailbox of the instance is administered in `/admin/email` (§11.12). It
holds a template per kind of message — the ticket message, the readiness
message and the test message. A template is a plain text with the placeholders:

| Placeholder | Meaning |
| --- | --- |
| `{ticket_no}` | the number of the ticket |
| `{priority}` | the priority of the ticket |
| `{object}` | the name of the object and its location |
| `{location}` | the location of the object |
| `{system_type}` | the system type of the report |
| `{text}` | the short text of the report |
| `{aa_sa}` | the AA/SA number, empty when there is none |
| `{url}` | the deep link into the ticket |
| `{pool}` | the pool of a readiness message |
| `{starts_at}` | the start of a readiness shift in `Europe/Berlin` |
| `{ends_at}` | the end of a readiness shift in `Europe/Berlin` |
| `{state}` | the state of a readiness shift |

The server renders the template as HTML: the empty lines become paragraphs,
the values are escaped and `{url}` becomes a link. A kind of message without a
template uses the built-in default of the product. The templates live in the
`config` of the row of the channel (`templates`), not in a table of their own.

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
`oncall.reminder_unconfirmed_h`. The scan counts the reminders of the shift
and reminds again after `oncall.reminder_repeat_h` hours (WP-M23-09b): the
row carries the number of the reminder in its target, so the office sees how
often it asked. A row that is still `PENDING` holds the next reminder back —
one at a time.

**The delivery of a message of a user** goes over the set-up channels of that
user (§11.4): one outbox row per confirmed channel, each row carrying the
target of the user (the room, the chat, the topic, the address). A channel that
fails follows the rule of the chain — the next channel of the installation
answers, so a broken address never loses a message. A row without a user — the
broadcast of an action without a target — carries the target of the
installation (§11.1) and goes to the mail addresses of the users for the
e-mail (ADR-0046).

**A delivery that fails finally becomes a task of the administration**
(§11.18, ADR-0052). A row that ends as `FAILED` **and** leaves no fallback
open — no further channel of the chain answers for it — is a message that never
arrived. Such a row writes the event type `notification.delivery_failed` for
every user with `notification.read_all`; the way is the confirmed channel of
the recipient (§11.4), so the administration is reached the way every other
user is reached. The alarm of a failed delivery is throttled: one task per
channel and machine code per hour, and a failure of the channel that carries
the alarm writes no new task.

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

## 11.9 The required channels and the minimum number of channels

The rule of the administration answers one question: **what must a user have
set up to be reachable** (ADR-0045). Two settings carry it:

| Setting | Meaning |
| --- | --- |
| `notifications.required_channels` | the channel kinds every user must have set up |
| `notifications.minimum_channel_count` | how many channels a user must have set up in total |

A user **fulfils** the rule when every required channel is set up — linked
**and** confirmed (§11.3a) — **and** the number of the set-up channels of the
user reaches the minimum. Both settings are empty resp. `0` by default: the
rule is off until the admin decides.

The list may only name channels that are configured; a channel of the list that
is not configured is refused with `422 invalid_request`, so the rule never
promises a reach that cannot happen. `signal` may never be named: it has no
address of the user, so no user could ever fulfil it.

The rule **warns, it never blocks** (ADR-0045):

- **every internal page** of a user who does not fulfil the rule carries a
  large band that names the missing channels and links to the setup — a
  warning that can be clicked away is no warning (§11.17, ADR-0048),
- the administration sees the users who do not fulfil the rule with their
  channels and the count of their set-up channels,
- nothing is blocked — no login, no assignment, no delivery.

The former setting `notifications.minimum_channels` (the mandatory channels of
the critical tickets) is gone: the rule of the administration now applies to
every user and every event (ADR-0045).

## 11.10 The data model

| Table | Change |
| --- | --- |
| `notification_channels` | the columns `kind` (unique), `enabled`, `label`, `config` (jsonb) and `secret` (write-only) |
| `notification_accounts` | the accounts of the users (§11.3) with the columns `target` (the target of the user) and `verified_at` (the confirmation, §11.3a) |
| `notification_preferences` | **removed** — the selection per event type does not exist any more (§11.4, ADR-0045) |
| `notification_items` | **new** — the task of a user (§11.18, ADR-0052): one row per user and event with the event type, the machine-readable params of the message, the ticket number or the shift and the read receipt |
| `notification_messages` | the delivery attempt of a message (§11.16, ADR-0052): the row per user and channel with its state, plus the column `notification_item_id` (FK to `notification_items`, `ON DELETE SET NULL`) — the task of the attempt |
| `outbox` | the column `event_type` (check over the seven types and the instance types of §11.18) and the column `shift_id` (FK to `oncall_shifts`, cascade, nullable); `ticket_id` becomes nullable with the check that exactly one of the two is set (ADR-0021, migration 0034) |
| `settings` | the rows `notifications.required_channels` and `notifications.minimum_channel_count` (§11.9) |

## 11.11 The API

| Route | Permission | Meaning |
| --- | --- | --- |
| `GET /api/v1/admin/channels` | `notification.read` | the channels with their state, their public configuration and `secretSet` |
| `PATCH /api/v1/admin/channels/:kind` | `notification.write` | the configuration of a channel; a secret is write-only |
| `POST /api/v1/admin/channels/:kind/test` | `notification.write` | sends a test message and answers `{ delivered }`; an optional body `{ topic }` overrides the test target (for example an ntfy test topic) |
| `GET /api/v1/settings/notifications/channel-policy` | `settings.read` | the required channels and the minimum number of channels (§11.9) |
| `GET /api/v1/settings/notifications/alarm` | `settings.read` | the sound of the installation and the interval of its repetition (§11.17) |
| `PUT /api/v1/settings/notifications/alarm` | `settings.write` | replaces them; the interval is a whole number of seconds between 15 and 600 |
| `GET /api/v1/notifications/mute` | session | the end of the silence of the signed-in user (§11.17) |
| `POST /api/v1/notifications/mute` | session | the user is silent for one hour; the sound only (§11.17) |
| `PUT /api/v1/settings/notifications/channel-policy` | `settings.write` | replaces them; a channel that is not configured is refused with `422 invalid_request` |
| `GET /api/v1/admin/notifications/compliance` | `notification.read` | the users with their channels, the missing required channels and the count of their set-up channels (§11.9) |
| `GET /api/v1/notifications/status` | `notification.read` | the status of every channel (§11.8) |
| `GET /api/v1/notifications/delivery` | `notification.read` | the delivery problems and the lost messages (§11.8) |
| `POST /api/v1/notifications/delivery/acknowledge` | `notification.write` | the quittature of the problems (§11.8) |
| `GET /api/v1/notifications/items` | session | the tasks of the signed-in user (§11.18) |
| `GET /api/v1/notifications/items/unread-count` | session | the number of the unhandled tasks — the badge of the bell and the alarm band (§11.18) |
| `PATCH /api/v1/notifications/items/:id/read` | session | the read receipt of one own task (§11.18) |
| `GET /api/v1/admin/notifications/deliveries` | `notification.read_all` | the delivery attempts of the instance — the protocol (§11.16) |
| `GET /api/v1/notifications/accounts` | session | the own accounts with their state — linked, set up or missing (§11.3, §11.3a) |
| `POST /api/v1/notifications/accounts/telegram/code` | session | a one-time code for the Telegram bot |
| `POST /api/v1/notifications/accounts/telegram` | session | the code is checked, the account is stored |
| `POST /api/v1/notifications/accounts/matrix` | session | the homeserver, the matrix id and the token are verified and stored |
| `POST /api/v1/notifications/accounts/email` | session | the own mail address is stored as the account of the e-mail channel |
| `POST /api/v1/notifications/accounts/:channel/verification` | session | sends the one-time code over the channel of the account and answers the deadline (§11.3a) |
| `POST /api/v1/notifications/accounts/:channel/verification/confirm` | session | the code the user copied is checked; a correct code confirms the account (§11.3a) |
| `DELETE /api/v1/notifications/accounts/:channel` | session | the own account of a channel is removed |

The routes of the **messages** leave the API with phase 30 (§11.18,
ADR-0052): `GET /api/v1/notifications/messages`,
`GET /api/v1/notifications/messages/unread-count` and
`PATCH /api/v1/notifications/messages/:id/read` are replaced by the three
routes of the tasks. The rows they read stay — they are the protocol of §11.16.

## 11.12 The UI

- `/admin/channels` — the administration of the channels: the state of every
  channel, the configuration, the write-only secret, the test message and the
  failing channels with the time of the last failure. The page also holds the
  **rule of the administration** (§11.9) — the required channels and the
  minimum number of channels — and the **channels of the users**: which user
  has which channel set up, without the address of the user (§11.9).
- `/admin/email` — the **mailbox of the instance** (ADR-0046): the SMTP
  connection, the sender with its display name, the templates per kind of
  message, the base address of the deep link, the test mail to an address and
  the log of the last deliveries.
- `/admin/delivery` — the delivery problems (§11.8): the failing channels with
  the time of the last failure, the machine code and the number of the
  unacknowledged failures, the messages that never arrived and the quittature
  of the problems.
- `/notifications` — the **tasks of the signed-in user** (§11.18): one entry per
  task, with the readable text of the event, the deep link into the ticket or
  into the readiness and the read receipt. The page carries **no channel and no
  delivery state** — the way of a message belongs to the protocol (§11.16). The
  bell of the shell and the alarm band count the same tasks (§11.17).
- `/admin/notifications` — the **protocol of the delivery** (§11.16): every
  delivery attempt of the instance with its recipient, its event, its channel,
  its state, the machine code of a failure, the time and the number of the
  attempts, with the filters of §11.16. The page names the users; the inbox of
  a user names the tasks. The page is an entry of the settings menu next to the
  delivery problems and links to them.
- `/settings/notifications` — the own channels: the linked accounts (Telegram,
  Matrix, ntfy, e-mail, WhatsApp Web), the subscription QR of ntfy and, per
  channel, its state — **set up** (green), **linked but not confirmed** (amber)
  or **missing** (red) — the button that sends the confirmation code, the field
  for the code and the button that removes the account. There is **no selection
  per event type** any more: every event goes over these channels (§11.4,
  ADR-0045). The warning of the rule of the administration (§11.9) stands in
  the shell on **every** page — this page holds the setup it links to.
- The **alarm band** of the shell (§11.17): it appears while unhandled
  messages exist, shines and moves, and carries the button „1 Stunde stumm“
  with the remaining time and the button „Ton aktivieren“. The sound of the
  installation is decided by the administration, the silence by the user — the
  inbox page carries no switch for the tone any more (ADR-0048).
- Both pages are entries of the settings menu (§14 of `PLAN.md`). Each page links
  to the other exactly once: the administration names the own page
  (`admin.channels.verification.personalLink`, WP-M14-48) and the own page names
  the administration (`notifications.administration.link`, WP-M14-54) — the link
  carries no permission check and the two layers stay apart.

**The texts of the channel administration belong to their channel.** The texts in
`admin.channels.errors` are written for ntfy: they name its topic, its token and
its server. Every other channel reads the neutral texts of the delivery page
(`admin.delivery.reasons.<channel>.<code>`, then `admin.delivery.reasons.<code>`)
on the card as well, and a code without a text falls back to a sentence that
names the machine code and points to the log of the API and to the page of the
delivery problems. The card of the web push never explains a failure with an
ntfy sentence, the card of Matrix never claims a taken topic (WP-M14-161d,
WP-M15-09).

**An incomplete VAPID trio is named on the card.** The trio is one value
(WP-M14-170): a row of the administration that carries only a part of it — a
public key without the private key, a Subject without a key — leaves the values
of the environment untouched, so the browser subscribes with one key and the
server signs with another and the push service refuses every send. While the row
of `webpush` is incomplete the card warns about it: the values of the `.env`
still apply beside the stored part, one generated pair has to be saved together
or the row has to be deleted (WP-M15-11).

**The state of the push in the browser.** The card of `/settings/notifications`
and the inbox of `/notifications` ask **this browser** for its own push
subscription — never the account of the user on the server. A browser without a
push manager, a browser with a blocked permission, a browser without a
subscription and a browser that does not answer are four different states, and
the UI names the state it found instead of a general claim: a statement about
the browser that was never checked is a lie (WP-M14-142).

**The inbox is an alarm.** The inbox is built for the fastest way from an alarm
to the work:

- The title of a ticket message is its ticket number and a link into
  `/tickets/:ticketNo`; a readiness message names a pool and stays plain text
  (§11.5).
- Every unread message of the own inbox carries its own quittature button with
  its own pending state. A slow receipt for one message never blocks the next,
  and a refused quittature is named on the page instead of failing silently.
- The unread-only filter is available to every session; the addressee filter
  stays the right of `notification.read_all` (§11.16).
- The list and the bell of the shell ask again every half minute and when the
  window regains the focus, so an alarm appears without a reload.
- The alarm tone is a choice **of this browser** and starts off. It is built
  from the Web Audio oscillators (no audio file), sounds when the unread count
  rises and never blocks the inbox when the browser has no audio output.
- A pushed alarm does not disappear after a few seconds: the service worker
  shows it with `requireInteraction` and a vibration pattern, so it stays until
  the user acts on it or closes it.

## 11.13 The security

- The secrets of the channels and of the accounts are write-only: never
  answered, never logged, never part of an event payload. The access token of
  the ntfy server (ADR-0022) travels only in the `Authorization` header.
- The messages carry no contact data of the reporter and no photo.
- The Telegram code expires after ten minutes and is used once.
- The confirmation code of a channel of a user (§11.3a) expires after ten
  minutes and is used once; it is sent over the channel and never answered by
  the API.
- The address of a user (a chat id, a room, a topic, a mail address) never
  reaches the administration: the administration sees the kind of the channel
  and its state, never the address of the user (§11.9).
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
A send that fails **before** the request leaves the server — a broken
subscription row, a transport that the build does not offer — carries
`push_send_failed` and never blames the network (WP-M14-176). The card of the
channel administration (§11.12) names the same cause in the
interface language for a failing test send: the codes `no_keys`,
`vapid_key_mismatch`, `push_unauthorized`, `push_rejected`,
`push_unreachable`, `push_send_failed` and `push_subscription_dead` carry
their own texts, because
the texts of the channel administration belong to the ntfy channel and name its
topic and its token (WP-M15-08).

**The test send of the web push reaches a device.** An empty subscription list
stays a no-op of the adapter (§11.15, WP-M7-09): a ticket notification to nobody
is silent. The **probe** of the administration is different — `POST
/api/v1/admin/channels/webpush/test` counts the rows of `push_subscriptions` and
without a single row answers `delivered: false` with the code
`push_no_subscription`: a click that reached no device proves nothing and must
never look like a success (WP-M15-10).

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

## 11.16 The protocol of the delivery (ADR-0052)

The **protocol** answers the question of the office „are all messages there?“:
which message arrived at which user, over which channel, with which machine
code and at which time. It is the reading of the table `notification_messages`
— one row per **delivery attempt** — and it belongs to the administration. The
page `/admin/notifications` shows it; the inbox of a user (§11.18) shows the
other half of the truth: the tasks.

The right to the protocol is a permission of its own:

| Permission | Meaning |
| --- | --- |
| `notification.read_all` | read the messages of **other** users |

The key belongs to no default role — the administration assigns it to a role
over the role API (`specs/01-rbac.md` §3.8), `admin` holds it through the
catalogue. Without the key the route answers `403 forbidden`: the protocol
names the users, and a user without the key may read his own tasks only.

### The filters

`GET /api/v1/admin/notifications/deliveries` reads the filters of the query:

| Filter | Meaning |
| --- | --- |
| `userId` | the addressee of the attempt |
| `channel` | the channel of the attempt |
| `eventType` | the event type of the attempt (§11.4) |
| `state` | the state of the delivery (`PENDING`, `SENT`, `FAILED`) |

An unknown value answers `400 invalid_request` with the field path. The read
receipt of a task is not a right of the protocol: the read receipt belongs to
the task of the user (§11.18) and never to the attempt.

### The answer

Every row carries its addressee (`{ userId, name }` — the name of the user,
else the e-mail), the event type, the channel, the state, the machine code of a
failure, the time of the attempt and the number of the attempts. The answer
carries the list of the addressees with the number of their attempts; the list
applies every filter **except** the filter of the addressee, so it stays
complete while a filter is active.

The protocol never carries the address of a user — no topic, no chat id, no
mail address (§11.13) — and never a secret.

## 11.17 The alarm of the instance (ADR-0048)

The alarm of StörDesk has three parts: the **sound**, the **visual band** and
the **setup warning**. The first two belong to the layer, the third belongs to
the rule of the administration (§11.9).

### The settings of the installation

| Setting | Meaning |
| --- | --- |
| `notifications.alarm_tone_enabled` | whether the installation alarms with a sound at all (`true` by default) |
| `notifications.alarm_repeat_seconds` | how often the sound comes again while unhandled messages exist (60 by default, 15 … 600) |

Both rows are read and written by
`GET`/`PUT /api/v1/settings/notifications/alarm` behind `settings.read` and
`settings.write`. The administration edits them with the other notification
settings (§11.12). There is no per-channel and no per-user switch for the
sound: the office either alarms with a tone or it does not.

### The mute of a user

The silence is the decision of a user and lasts **one hour**. The row
`notifications.mute.<userId>` of the settings table holds the end of the
silence; `POST /api/v1/notifications/mute` writes it, `GET
/api/v1/notifications/mute` reads it — both behind the session of the user, so
the silence follows the user and not the device.

The mute silences the **sound only**. The band and the bell keep shining and
keep moving while unhandled messages exist.

### The band of the alarm

The band lives in the shell and therefore on every internal page. It appears
while unhandled messages exist, shines and moves, and carries:

- the button **„1 Stunde stumm“** with the remaining time of the silence,
- the button **„Ton aktivieren“** — a browser plays a sound only after a
  gesture of the user; without the gesture the sound stays silent and the
  button asks for it.

The **interval governs the sound only**: the sound comes at once when the
messages arrive and again every `alarm_repeat_seconds` while they are
unhandled. The band itself does not repeat in that rhythm — it is a state, not
a repetition.

The bell of the menu moves in the same rhythm while unhandled messages exist.

### The pushed alarm

A service worker has no Web Audio: only a page may play a tone. The service
worker therefore asks the open pages for the sound after a push
(`postMessage` with the type `PLAY_ALARM_TONE`); the page plays it with the
same rules — the sound of the installation, no mute, a gesture given.

### The warning of the setup

The warning of §11.9 is **not** a small box on the own notifications page any
more: it is a large band at the top of the shell, it names the channels the
user does not have set up, it links to the setup and it cannot be dismissed.
A warning that can be clicked away is no warning.

## 11.18 The task of the user (ADR-0052)

The **task** is the message of StörDesk to a user: one thing that happened and
one place where the user acts on it. The task is not the delivery — the
delivery is the way the task travels and is read in the protocol (§11.16).

### The data model

The table `notification_items` holds **one row per user and event**:

| Column | Meaning |
| --- | --- |
| `user_id` | the addressee of the task |
| `event_type` | the event that produced it (§11.4) |
| `params` (jsonb) | the machine-readable params of the message (§11.5) — never the topic of a user, never a secret |
| `ticket_no` | the ticket of the task, empty for a task of the readiness |
| `shift_id` | the shift of the task, empty for a task of a ticket |
| `created_at` | the time of the task |
| `read_at` | the read receipt of the user |

The delivery attempts of the task stay in `notification_messages` and point at
the task with the column `notification_item_id` — the protocol reads the task
under its attempts, the inbox reads the task alone.

### The write rule

A personal delivery writes **one** task per recipient, no matter how many
channels carry it (§11.4): a technician with three confirmed channels sees one
task and not three. The rows of the protocol are written as before — one per
channel — and the task is written in the same transaction, so a task exists
exactly when the message was queued.

The **text** of a task is not stored. The API keeps the event type and the
params; the interface composes the readable text from them in the language of
the user (`PLAN.md` §3.1). A task of a ticket carries the deep link into the
ticket, a task of the readiness the deep link into the calendar (§11.5).

The task knows two states: **unread** and **read**. There is no state
„handled“: which events are tasks at all and when a task is closed belong to
the settings of the workflow, not to the notification layer.

### The count and the alarm

The bell of the shell and the alarm band of the instance (§11.17) read the
**same** number: the count of the unhandled tasks of the user. The number is
the number of things to do — not the number of attempts, not the number of
channels. The alarm therefore sounds once for a task that travels over three
channels.

### The task of a failed delivery

A delivery that fails finally (§11.7) is a message that never arrived and
belongs to the administration: the event type `notification.delivery_failed`
writes a task for every user with `notification.read_all` (§11.16). The way is
the confirmed channel of the recipient (§11.4) — the administration is reached
the way every other user is reached, and a recipient who does not fulfil the
rule of the administration (§11.9) gets nothing; the failure stays visible in
the protocol.

The alarm is throttled: **one task per channel and machine code per hour**, so
a channel that is broken for a day does not flood the inbox of the
administration. A failure of the channel that carries the alarm writes no new
task — the alarm never alarms itself.

The row of the alarm belongs to no ticket and to no shift: it carries the event
type `notification.delivery_failed`, no ticket, no shift, and the params of the
failure (the channel, the machine code, the ticket number of the message that
never arrived). The checks of the `outbox` table know that shape (§11.15).
