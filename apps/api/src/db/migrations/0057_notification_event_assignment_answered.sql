-- The answer of an assignment (`specs/07-escalation.md` §7.14, ADR-0039,
-- WP-M19-07): the user who made the assignment is notified when the technician
-- accepts or declines the ticket. The event type joins the list of §11.4, so
-- a user may choose the channels for it under `/settings/notifications`.
--
-- The check of the two tables is widened; no row changes.

ALTER TABLE "notification_preferences" DROP CONSTRAINT "notification_preferences_event_type_check";
--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_event_type_check" CHECK ("notification_preferences"."event_type" IN ('ticket.created', 'ticket.assigned', 'ticket.assignment_answered', 'ticket.escalated', 'ticket.resolved', 'oncall.assigned', 'oncall.swap_requested', 'oncall.unconfirmed_reminder'));
--> statement-breakpoint
ALTER TABLE "outbox" DROP CONSTRAINT "outbox_event_type_check";
--> statement-breakpoint
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_event_type_check" CHECK ("outbox"."event_type" IN ('ticket.created', 'ticket.assigned', 'ticket.assignment_answered', 'ticket.escalated', 'ticket.resolved', 'oncall.assigned', 'oncall.swap_requested', 'oncall.unconfirmed_reminder', 'channel.health_warning'));
