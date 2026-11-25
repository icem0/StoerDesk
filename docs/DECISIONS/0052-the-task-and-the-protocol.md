# ADR-0052: The message is a task, the delivery attempt is the protocol

- Status: accepted
- Date: 2026-11-25
- Stakeholders: office, on-call technicians, administration

## Context

The page `/notifications` answers two different questions at once, and since
ADR-0045 it answers both of them wrong.

1. **The inbox of a user is a delivery log.** The rows of the list come from
   the table `notification_messages`, and every row is one **delivery attempt**:
   one user, one channel, one event (`enqueuePersonalDeliveries`). Since a
   message goes over **every confirmed channel of the recipient** (ADR-0045), a
   technician with three confirmed channels sees the same event **three times**,
   and the alarm band of the instance (ADR-0048) counts three unhandled
   messages where there is one thing to do. The content of a row is the
   machine-readable params of the message (§11.5) — `priority · objectName ·
   rule · stage` — not a text that a reader can read.
2. **The second view on the same page is the arrival proof.** The office asked
   for a filter that shows *which message arrived at which user*; it lives on
   the inbox page and is guarded by `notification.read_all` (§11.16). The
   question of the office — „are all messages there?“ — is a question about the
   **delivery**, not about the messages of a user.
3. **A delivery that fails finally stays silent.** The failing channels are
   visible on `/admin/delivery` and as a badge of the settings menu (§11.8), and
   the warning of a broken channel goes out at most once per channel and per
   day (§11.15). A **single** message that never arrived — a critical ticket
   that never reached the technician who is on duty — reaches nobody. The
   office asked for that: an administration must learn that a message did not
   arrive.
4. **The reach of the administration is already decided.** Every user — the
   admin included — must fulfil the rule of the administration (§11.9, ADR-0045)
   to be reachable, and the administration sees the users who do not fulfil it
   (`GET /api/v1/admin/notifications/compliance`). The alarm of a failed
   delivery therefore needs **no new way and no new group**: it is an ordinary
   message to the administration and goes over the confirmed channels of its
   recipients.

Two questions of the office are **not** decided here: *which* events are tasks
at all and *when* a task is closed. That belongs to the settings of the
workflow.

## Decision

1. **One task per user and event.** A new table `notification_items` holds one
   row per user and event: the event type, the machine-readable params of the
   message, the reference to the subject (the ticket number or the shift) and
   the read receipt. The personal delivery of an event writes **one** task per
   recipient, no matter how many channels carry it.
2. **The inbox of a user shows the tasks.** `/notifications` shows the tasks of
   the signed-in user: the **readable text** — the interface composes it from
   the event type and the params in the language of the user, the API stores no
   translated text (§3.1) — the **deep link** into the ticket or into the
   readiness, and the read receipt. The channel and the delivery state leave
   the inbox: they describe the way, not the task.
3. **The protocol belongs to the administration.** The rows of
   `notification_messages` stay and become the **protocol**: one row per
   delivery attempt with its channel, its state, its machine code and its
   time. The new page `/admin/notifications` shows them with the filters of
   §11.16 — the recipient, the channel, the event, the state — and is guarded
   by `notification.read_all`. The admin filter leaves the inbox page;
   `/admin/delivery` keeps the problems of the channels and their quittature.
4. **A delivery that fails finally becomes a task of the administration.** The
   new event type `notification.delivery_failed` writes a task for every user
   with `notification.read_all`. The way is the **confirmed channels of the
   recipient** (ADR-0045) — no special channel, no broadcast of the instance.
   A recipient who does not fulfil the rule of the administration gets nothing;
   the failure stays visible in the protocol. No new permission is introduced:
   `notification.read_all` already means „may read the messages of other
   users“.
5. **The alarm of a failed delivery is throttled.** One task per channel and
   machine code per time window (60 minutes), so a channel that is broken for
   a day does not flood the inbox of the administration. A failure of the
   channel that carries the alarm writes **no** new task — the alarm never
   alarms itself.
6. **No state „handled“ in this decision.** A task carries the read receipt
   and the place of the action. Which events are tasks and how a task is
   closed belong to the settings of the workflow; the phase does not invent
   them.
7. **No backfill.** The tasks begin with the phase. The old rows stay in the
   protocol, where they were always read; the inbox of a user starts with the
   tasks of the phase.

## Alternatives

- **Keep one row per channel in the inbox.** Rejected: the same event three
  times, and the badge of the bell and the alarm band count the attempts
  instead of the things to do.
- **Keep the inbox as a log and add a second page for the tasks.** Rejected:
  the user would read a machine string where a message should be; the inbox is
  the place a technician looks when the alarm sounds.
- **Replace `notification_messages` by the tasks and drop the protocol.**
  Rejected: the problems of the delivery (§11.8) and the history of the
  attempts need the rows, and the migration would lose them.
- **Announce the failed delivery over the channels of the installation**
  (like the warning of a broken channel, §11.15). Rejected: the broadcast
  reaches every user, including the ones who cannot do anything about a
  broken channel of a colleague; the reach of the administration is known.
- **A new right `notification.alerts`.** Rejected: `notification.read_all`
  already names the group of the administration that may read the messages of
  other users; a second key would be a second way to the same group.
- **Backfill the tasks from the old rows.** Rejected: the params of the old
  rows are a string, not a structure; a backfill would invent data.
- **Give the task the state „handled“ now.** Rejected: the office named the
  settings of the workflow as the place of that decision; a second place
  would decide it twice.

## Consequences

- The migration `0063` adds the table `notification_items` and the column
  `notification_messages.notification_item_id` (the rows of the old phase stay
  readable without a task).
- The routes of the phase: `GET /api/v1/notifications/items`,
  `GET /api/v1/notifications/items/unread-count`,
  `PATCH /api/v1/notifications/items/:id/read` and
  `GET /api/v1/admin/notifications/deliveries`. The three routes of the
  messages leave the API.
- The bell of the shell and the alarm band read the **same** count — the count
  of the unhandled tasks. One route, two consumers.
- The text of a task is composed in the web app; the API stores the event type
  and the params, never a translated text.
- The protocol names the users; the inbox names the tasks. Neither page mixes
  the two.
