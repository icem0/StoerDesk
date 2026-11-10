-- Reporter metadata of an internal report (WP-M2-98): the channel the fault was
-- reported through, whether an internal employee or an external person reported
-- it, and the internal user who handed it to the recorder. Existing tickets keep
-- NULL in all three columns.
ALTER TABLE "tickets" ADD COLUMN "reporter_channel" text;
--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "reporter_kind" text;
--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "reported_by_user_id" uuid;
--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_reported_by_user_id_users_id_fk" FOREIGN KEY ("reported_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_reporter_channel_check" CHECK ("tickets"."reporter_channel" IS NULL OR "tickets"."reporter_channel" IN ('phone', 'email', 'messenger'));
--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_reporter_kind_check" CHECK ("tickets"."reporter_kind" IS NULL OR "tickets"."reporter_kind" IN ('internal', 'external'));
--> statement-breakpoint
CREATE INDEX "tickets_reported_by_user_id_idx" ON "tickets" USING btree ("reported_by_user_id");
