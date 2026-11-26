# ADR-0062: A failed delivery reaches the mailbox of the administration

- Status: accepted
- Date: 2026-11-26
- Stakeholders: office, administration

## Context

ADR-0052 made a delivery that fails **finally** a task of the administration
and delivered it over the **confirmed channels** of the recipients. The office
read the result in practice in two ways:

1. **The settings banner was the visible warning.** The open delivery problems
   stood as a badge on the settings page (`app.channelWarning.badge`,
   WP-M14-161c). It counted every failed row — also a delivery that a later
   channel of the chain still carried — so it warned about a channel, not
   about a lost message. The office wants the warning gone from the settings
   page.
2. **The task reached only a confirmed channel.** An administrator without a
   confirmed account or device received nothing. The failure of a channel is
   exactly the moment in which the channel of the administration may be the
   broken one.

The office asked for the other thing: a failed delivery itself is the event the
administration must learn, and the mailbox is the place of the task — not a
banner and not a channel that may be the failing one.

## Decision

1. **Every failed delivery becomes a task.** A row of the outbox that ends
   `FAILED` writes the event type `notification.delivery_failed` — also when a
   later channel of the chain still delivers the message. The office learns
   that a channel did not deliver, not only that a message was lost.
2. **The task lives in the mailbox only.** No outbox row and no channel carry
   the alarm. The task is written into `notification_items`; the inbox, the
   bell and the alarm band show it. An administrator without a confirmed
   channel is reached too, and the alarm cannot fail over a channel of its own
   — it writes no outbox row and never alarms itself.
3. **The throttle stays.** One task per channel and machine code per hour, so a
   channel that is broken for a day does not flood the inbox.
4. **The settings page carries no badge.** The warning of a failed delivery is
   the task in the mailbox; the problems stay listed on `/admin/delivery`, and
   the dashboard tile keeps its channel status. A badge of the settings menu
   would be a second warning that nobody has to look for.

## Alternatives

- **Keep the channel delivery of the alarm.** Rejected: a broken channel is
  the reason for the alarm, and an administrator without a confirmed channel
  would still learn nothing.
- **Keep the settings badge.** Rejected: it warned about a channel even when
  the message had arrived over the fallback, and it was the only warning there
  was.
- **Alarm only on a message that never arrived.** Rejected: the office wants to
  know that a channel is failing, not only after the last fallback failed too.

## Consequences

- The settings page loses the badge and its query; the `/admin/delivery` page,
  its quittature and the dashboard tile stay as they are.
- The alarm writes only tasks: the server texts of a delivered alarm remain for
  rows that were queued before this decision, but no new row uses them.
- ADR-0052 decisions 4 and 5 are amended: the task is written for every failed
  delivery and in the mailbox only.
