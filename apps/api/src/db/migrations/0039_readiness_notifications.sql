-- The readiness of the on-call calendar announces itself over the messenger
-- channels (WP-M14-27, ADR-0021, specs/10-notifications.md §11.4, §11.10): the
-- outbox gains `event_type` (a check over the seven types) and a nullable `shift_id`
-- with a cascade FK to `oncall_shifts`, `ticket_id` becomes nullable with the
-- check that exactly one of the two is set, and the event check of
-- `notification_preferences` widens from the four ticket types to the seven types
-- of ADR-0021.
--
-- WP-M14-27 announced migration 0034; 0034 (ticket statuses), 0035 (work order
-- text), 0036 (ntfy verification), 0037 (escalation stage chain) and 0038 (the
-- stage clock of a rule) were already taken, so this lands as 0039.
--
-- `ticket_id` keeps its FK and its cascade; only the `NOT NULL` is dropped, so
-- every row of a running instance keeps its ticket and defaults to
-- `ticket.created`. No existing row is rewritten.

ALTER TABLE "outbox" ALTER COLUMN "ticket_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "outbox" ADD COLUMN "event_type" text DEFAULT 'ticket.created' NOT NULL;
--> statement-breakpoint
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_event_type_check" CHECK ("outbox"."event_type" IN ('ticket.created', 'ticket.assigned', 'ticket.escalated', 'ticket.resolved', 'oncall.assigned', 'oncall.swap_requested', 'oncall.unconfirmed_reminder'));
--> statement-breakpoint
ALTER TABLE "outbox" ADD COLUMN "shift_id" uuid;
--> statement-breakpoint
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_shift_id_oncall_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."oncall_shifts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_ticket_or_shift_check" CHECK (("outbox"."ticket_id" IS NOT NULL) <> ("outbox"."shift_id" IS NOT NULL));
--> statement-breakpoint
CREATE INDEX "outbox_shift_id_idx" ON "outbox" USING btree ("shift_id");
--> statement-breakpoint
ALTER TABLE "notification_preferences" DROP CONSTRAINT "notification_preferences_event_type_check";
--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_event_type_check" CHECK ("notification_preferences"."event_type" IN ('ticket.created', 'ticket.assigned', 'ticket.escalated', 'ticket.resolved', 'oncall.assigned', 'oncall.swap_requested', 'oncall.unconfirmed_reminder'));
