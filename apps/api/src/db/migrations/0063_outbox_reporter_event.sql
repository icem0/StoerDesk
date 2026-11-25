-- The report of the reporter as an event of the outbox
-- (`specs/19-customer-portal.md` §19.8, ADR-0056):
--
-- The action `notify_reporter` writes one row per event; the row carries the
-- address of the reporter as its target and the flag `reporter_mail`, so the
-- drain sends the mail of the kind `customer_ticket` to that address.
--
-- The event type is no event a user selects a channel for — the customer
-- chooses to be informed with the report itself.
ALTER TABLE "outbox" DROP CONSTRAINT "outbox_event_type_check";
--> statement-breakpoint
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_event_type_check" CHECK ("outbox"."event_type" IN ('ticket.created', 'ticket.assigned', 'ticket.assignment_answered', 'ticket.escalated', 'ticket.resolved', 'oncall.assigned', 'oncall.swap_requested', 'oncall.unconfirmed_reminder', 'channel.health_warning', 'ticket.reporter'));
--> statement-breakpoint
-- The action `notify_reporter` joins the types of an action (`specs/19-customer-portal.md` §19.8).
ALTER TABLE "escalation_actions" DROP CONSTRAINT "escalation_actions_type_check";
--> statement-breakpoint
ALTER TABLE "escalation_actions" ADD CONSTRAINT "escalation_actions_type_check" CHECK ("type" IN ('notify','webhook','history','status_change','offer','assign','notify_reporter'));
