-- The task of a failed delivery (`specs/10-notifications.md` §11.18, ADR-0052):
-- a message that never arrived becomes a task of the administration.
--
-- The event type joins the instance event types: no user selects a channel for
-- it, and the row belongs to no ticket and to no shift — it names the channel,
-- the machine code and the message that never arrived in its params.
ALTER TABLE "outbox" DROP CONSTRAINT "outbox_event_type_check", DROP CONSTRAINT "outbox_ticket_or_shift_check";
--> statement-breakpoint
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_event_type_check" CHECK ("outbox"."event_type" IN ('ticket.created', 'ticket.assigned', 'ticket.assignment_answered', 'ticket.escalated', 'ticket.resolved', 'oncall.assigned', 'oncall.swap_requested', 'oncall.unconfirmed_reminder', 'channel.health_warning', 'ticket.reporter', 'notification.delivery_failed')), ADD CONSTRAINT "outbox_ticket_or_shift_check" CHECK ((("outbox"."ticket_id" IS NOT NULL) <> ("outbox"."shift_id" IS NOT NULL)) OR ("outbox"."event_type" IN ('channel.health_warning', 'notification.delivery_failed') AND "outbox"."ticket_id" IS NULL AND "outbox"."shift_id" IS NULL));
