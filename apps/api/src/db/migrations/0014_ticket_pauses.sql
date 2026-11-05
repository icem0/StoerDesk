CREATE TABLE "ticket_pauses" (
	"id" uuid PRIMARY KEY DEFAULT gen_uuid_v7() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"started_by_user_id" uuid,
	"ended_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ticket_pauses" ADD CONSTRAINT "ticket_pauses_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_pauses" ADD CONSTRAINT "ticket_pauses_started_by_user_id_users_id_fk" FOREIGN KEY ("started_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_pauses" ADD CONSTRAINT "ticket_pauses_ended_by_user_id_users_id_fk" FOREIGN KEY ("ended_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ticket_pauses_ticket_id_idx" ON "ticket_pauses" USING btree ("ticket_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_pauses_one_open_per_ticket" ON "ticket_pauses" USING btree ("ticket_id") WHERE "ticket_pauses"."ended_at" IS NULL;
