-- The configuration of the messenger channels (WP-M14-04, ADR-0019): the row of
-- `notification_channels` with that kind wins over the environment, the secret
-- is write-only (ADR-0005 rule) and the accounts of the users plus their
-- selection of the channels per event type live beside it
-- (specs/10-notifications.md §11.2, §11.3, §11.4, §11.10).
--
-- `notification_channels` exists since migration 0019 with its registry name
-- only and never held a row, so the new columns apply to an empty table.

ALTER TABLE "notification_channels" ADD COLUMN "kind" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "notification_channels" ADD CONSTRAINT "notification_channels_kind_check" CHECK ("kind" IN ('signal', 'matrix', 'ntfy', 'email', 'telegram', 'webpush', 'whatsapp'));
--> statement-breakpoint
ALTER TABLE "notification_channels" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "notification_channels" ADD COLUMN "label" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "notification_channels" ADD COLUMN "config" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "notification_channels" ADD COLUMN "secret" text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "notification_channels_kind_key" ON "notification_channels" USING btree ("kind");

CREATE TABLE "notification_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_uuid_v7() NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"external_id" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"secret" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_accounts_channel_check" CHECK ("channel" IN ('signal', 'matrix', 'ntfy', 'email', 'telegram', 'webpush', 'whatsapp'))
);
--> statement-breakpoint
ALTER TABLE "notification_accounts" ADD CONSTRAINT "notification_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "notification_accounts_user_channel_key" ON "notification_accounts" USING btree ("user_id","channel");
--> statement-breakpoint
CREATE INDEX "notification_accounts_created_at_idx" ON "notification_accounts" USING btree ("created_at");

CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_uuid_v7() NOT NULL,
	"user_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"channel" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_event_type_check" CHECK ("event_type" IN ('ticket.created', 'ticket.assigned', 'ticket.escalated', 'ticket.resolved')),
	CONSTRAINT "notification_preferences_channel_check" CHECK ("channel" IN ('signal', 'matrix', 'ntfy', 'email', 'telegram', 'webpush', 'whatsapp'))
);
--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preferences_user_event_channel_key" ON "notification_preferences" USING btree ("user_id","event_type","channel");
--> statement-breakpoint
CREATE INDEX "notification_preferences_created_at_idx" ON "notification_preferences" USING btree ("created_at");
