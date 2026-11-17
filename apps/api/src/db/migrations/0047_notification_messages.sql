-- Notification messages for users (WP-M14-120a, PLAN.md §12, §6).
-- The internal layer between the application and the external channels: one
-- row per notification that is enqueued for a specific user, so every user
-- sees which message went to which channel and whether it arrived.
-- Instance-chain rows (signal, matrix, email … without a specific user) are no
-- personal message and are not recorded here.
CREATE TABLE "notification_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_uuid_v7() NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"event_type" text NOT NULL,
	"state" text DEFAULT 'PENDING' NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "notification_messages_state_check" CHECK ("notification_messages"."state" IN ('PENDING', 'SENT', 'FAILED'))
);
--> statement-breakpoint
ALTER TABLE "notification_messages" ADD CONSTRAINT "notification_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "notification_messages_user_id_state_idx" ON "notification_messages" USING btree ("user_id", "state");
--> statement-breakpoint
CREATE INDEX "notification_messages_user_id_created_at_idx" ON "notification_messages" USING btree ("user_id", "created_at");
--> statement-breakpoint
-- The outbox row of a personal delivery points at its message: the drain flips
-- the state of the message to SENT or FAILED and the inbox shows the outcome.
ALTER TABLE "outbox" ADD COLUMN "notification_message_id" uuid;
--> statement-breakpoint
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_notification_message_id_notification_messages_id_fk" FOREIGN KEY ("notification_message_id") REFERENCES "public"."notification_messages"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "outbox_notification_message_id_idx" ON "outbox" USING btree ("notification_message_id");
