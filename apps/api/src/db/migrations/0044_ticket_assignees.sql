-- The technicians a ticket is assigned to (WP-M14-80, ADR-0026,
-- specs/02-data-model.md §4.13): the `assign` action of the escalation
-- distributes a ticket to a whole pool of technicians, and
-- `tickets.assigned_user_id` holds exactly one technician. The table is the
-- many-to-many of a distribution — one row per ticket and technician, the
-- primary key keeps a technician assigned once, and a deleted ticket takes its
-- assignees with it.

CREATE TABLE "ticket_assignees" (
	"ticket_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ticket_assignees" ADD CONSTRAINT "ticket_assignees_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_assignees" ADD CONSTRAINT "ticket_assignees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_assignees" ADD CONSTRAINT "ticket_assignees_pk" PRIMARY KEY ("ticket_id","user_id");--> statement-breakpoint
CREATE INDEX "ticket_assignees_user_id_idx" ON "ticket_assignees" USING btree ("user_id");
