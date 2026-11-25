-- The task of a user (`specs/10-notifications.md` §11.18, ADR-0052): one row
-- per user and event — the message of StörDesk to a user, not the delivery of
-- it.
--
-- The rows of `notification_messages` stay the protocol (§11.16): one row per
-- user and channel. The column `notification_item_id` points every attempt at
-- the task it belongs to, so the administration reads the attempts under the
-- task. The rows of the older phase keep a null task and stay readable.
--
-- The shift of a task is a plain uuid and no foreign key: a shift that is
-- deleted must not delete the task of the user.
CREATE TABLE "notification_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_uuid_v7() NOT NULL,
	"user_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ticket_no" text,
	"shift_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "notification_items" ADD CONSTRAINT "notification_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "notification_items_user_id_read_at_idx" ON "notification_items" USING btree ("user_id", "read_at");
--> statement-breakpoint
CREATE INDEX "notification_items_user_id_created_at_idx" ON "notification_items" USING btree ("user_id", "created_at");
--> statement-breakpoint
-- The task of the attempt: null for a row of the older phase.
ALTER TABLE "notification_messages" ADD COLUMN "notification_item_id" uuid;
--> statement-breakpoint
ALTER TABLE "notification_messages" ADD CONSTRAINT "notification_messages_notification_item_fk" FOREIGN KEY ("notification_item_id") REFERENCES "public"."notification_items"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "notification_messages_notification_item_id_idx" ON "notification_messages" USING btree ("notification_item_id");
