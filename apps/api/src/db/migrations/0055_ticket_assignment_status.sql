-- The state of an assignment (`specs/07-escalation.md` §7.14, ADR-0039,
-- WP-M19-02): the ticket names one technician (`assigned_user_id`, the column
-- the workflow already uses) and carries the status of the assignment
-- (`offered`, `accepted`, `declined`) beside the user who made it
-- (`assigned_by_user_id`, NULL for a rule-made assignment).
--
-- The columns are added without a default: an existing ticket has no
-- assignment, so its status stays NULL and no row is backfilled.

ALTER TABLE "tickets" ADD COLUMN "assignment_status" text;
--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "assigned_by_user_id" uuid;
--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assignment_status_check" CHECK ("tickets"."assignment_status" IS NULL OR "tickets"."assignment_status" IN ('offered', 'accepted', 'declined'));
--> statement-breakpoint
CREATE INDEX "tickets_assigned_by_user_id_idx" ON "tickets" USING btree ("assigned_by_user_id");
