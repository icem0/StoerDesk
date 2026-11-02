--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "assigned_user_id" uuid;
--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "reviewed_by_user_id" uuid;
--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "review_started_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "offered_to_user_id" uuid;
--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "offer_escalated_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "work_order_type" text;
--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "work_order_number" text;
--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "accepted_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "first_response_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "acknowledged_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "closed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_offered_to_user_id_users_id_fk" FOREIGN KEY ("offered_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "tickets_assigned_user_id_status_idx" ON "tickets" USING btree ("assigned_user_id","status");
