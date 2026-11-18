-- The instance row of the channel health warning (WP-M14-130b,
-- `specs/10-notifications.md` §11.15, ADR-0028): a warning belongs to no ticket
-- and to no shift, so the checks of the `outbox` table learn that shape.
--
-- The event type check gains the eighth type `channel.health_warning`. The
-- seven types of §11.4 stay the only types a user selects channels for — the
-- check of `notification_preferences` is not touched.
--
-- The ticket-or-shift check keeps its rule for every other row: a row carries
-- exactly one of a ticket and a shift. A row of the warning type may carry
-- neither — it announces the state of a channel, not the state of a ticket —
-- but never both.
ALTER TABLE "outbox" DROP CONSTRAINT "outbox_event_type_check", DROP CONSTRAINT "outbox_ticket_or_shift_check";
--> statement-breakpoint
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_event_type_check" CHECK ("outbox"."event_type" IN ('ticket.created', 'ticket.assigned', 'ticket.escalated', 'ticket.resolved', 'oncall.assigned', 'oncall.swap_requested', 'oncall.unconfirmed_reminder', 'channel.health_warning')), ADD CONSTRAINT "outbox_ticket_or_shift_check" CHECK ((("outbox"."ticket_id" IS NOT NULL) <> ("outbox"."shift_id" IS NOT NULL)) OR ("outbox"."event_type" = 'channel.health_warning' AND "outbox"."ticket_id" IS NULL AND "outbox"."shift_id" IS NULL));
