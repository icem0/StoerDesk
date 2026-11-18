# ADR-0028: A broken channel warns over another channel, once a day

- Status: accepted
- Date: 2026-11-18
- Stakeholders: office, manager, administrator

## Context

The office asked two questions about the web push: can the channel be checked
every day, and can a message over another channel announce that the
notification function is broken.

The web push has no status query. The only signal is the answer of the push
service to a real send: `404` or `410` means that the endpoint no longer
exists — the browser revoked the permission, the browser was reinstalled or the
subscription expired. A browser that never registered the channel is a second
case: the channel is configured, but nobody receives anything.

The status of §11.8 shows the numbers of the administration, but a list on a
page is not a warning: nobody looks at the page while a ticket is running. The
office needs the warning where a human already listens — the phone of the
technician.

## Decision

1. **The check is passive.** A dead subscription is recognised when a real
   send is answered with `404` or `410`; the adapter names it with the code
   `push_subscription_dead` and the channel removes the row of
   `push_subscriptions`. No test message is pushed into the browsers: a daily
   probe would show a notification in every subscribed phone every day and
   would prove nothing that the real send does not prove.
2. **The daily check reads the status, it does not push.** Once a day the
   instance reads the rows of the outbox and names the channels that are
   *broken*: their last delivery failed and no delivery of them succeeded
   since. The check is cheap, needs no push service and never disturbs a
   subscriber.
3. **The warning goes over another channel.** A broken channel enqueues one row
   of the event type `channel.health_warning` for the first configured channel
   of the chain of §11.1 that is not the broken one. The warning never goes to
   the broken channel and never falls back further: the warning is the last
   word about the channel, a fallback of the warning would only hide the
   failure behind a second failure.
4. **At most one warning per channel and per day.** A broken channel would
   otherwise warn with every ticket, and the office would mute the channel
   instead of repairing it. A channel that works again is silent.
5. **The text is translated and carries no emergency number.** The warning
   names the broken channel and the machine code of its last failure (de/en),
   it carries no contact data and no photo (§11.13) and it is not an emergency
   call path (`PLAN.md` §2).

## Alternatives

- **A daily test push into every subscribed browser.** Rejected in decision 1:
  the notification appears in every phone of the office every day, the push
  service counts the messages and the user learns to ignore the channel — the
  very thing the warning is meant to prevent.
- **The warning only on the page of the administration.** Rejected in decision
  3: a list on a page is not a warning. The badge of the dashboard (§11.8)
  stays as it is, the channel warning over another channel is added.
- **A warning per failed delivery.** Rejected in decision 4: the volume of the
  failures is not the signal, the state of the channel is.
- **A mail to the address of the administration.** Rejected: the mail server
  can be the broken channel itself, and an address of the administration is not
  part of the configuration of the instance.
- **A push into the channel that is broken.** Rejected in decision 3: a push
  service that answers `404` for every endpoint answers `404` for the warning
  too.

## Consequences

- The office hears a broken notification channel on the phone it already
  carries, once a day, with the name of the channel and the machine code of
  the failure — the same code the administration page shows (§11.8).
- The warning is an instance row: it belongs to no ticket and to no shift, so
  the checks of the `outbox` table learn that shape (migration `0049`).
- A dead subscription disappears from `push_subscriptions` after the next real
  send; the device returns with the card of WP-M14-126a.
- The chain of §17 (WP-M14-129a … WP-M14-129c, the year-free ticket number)
  stays untouched: the warning never carries a ticket number.
