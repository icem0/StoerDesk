-- The webhook event type of the escalation (WP-M13-07a): a delivery may carry
-- `ticket.escalated` beside the two types an endpoint subscribes to. The
-- subscription list of an endpoint stays untouched: the escalation delivers to
-- the endpoints that its rule selected (specs/07-escalation.md §7.5,
-- ADR-0017).

ALTER TABLE "webhook_deliveries" DROP CONSTRAINT "webhook_deliveries_event_type_check";
--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_event_type_check" CHECK ("event_type" IN ('ticket.created', 'ticket.status_changed', 'ticket.escalated'));
