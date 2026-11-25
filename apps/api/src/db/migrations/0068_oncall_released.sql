-- The release of a shift (`specs/04-oncall.md` §4a.3, ADR-0058): the
-- technician who had the shift learns that his duty is gone.
--
-- The event type joins the readiness events: the delete of a shift and the
-- handover of a shift to another technician write it for the technician who
-- had the shift. The row of a **deleted** shift belongs to no shift — the
-- shift is gone and the row has to survive its delete — so the event joins the
-- instance events in the check of the row: it names the shift in its params.
ALTER TABLE "outbox" DROP CONSTRAINT "outbox_event_type_check", DROP CONSTRAINT "outbox_ticket_or_shift_check";
--> statement-breakpoint
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_event_type_check" CHECK ("outbox"."event_type" IN ('ticket.created', 'ticket.assigned', 'ticket.assignment_answered', 'ticket.escalated', 'ticket.resolved', 'oncall.assigned', 'oncall.swap_requested', 'oncall.unconfirmed_reminder', 'oncall.released', 'channel.health_warning', 'ticket.reporter', 'notification.delivery_failed')), ADD CONSTRAINT "outbox_ticket_or_shift_check" CHECK ((("outbox"."ticket_id" IS NOT NULL) <> ("outbox"."shift_id" IS NOT NULL)) OR ("outbox"."event_type" IN ('channel.health_warning', 'notification.delivery_failed', 'oncall.released') AND "outbox"."ticket_id" IS NULL AND "outbox"."shift_id" IS NULL));
