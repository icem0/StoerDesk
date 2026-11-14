-- Proof that a channel target was actually reached (WP-M14-47,
-- specs/10-notifications.md §11.2): a channel counts as configured only after
-- a one-time code was sent to it and entered back in the admin UI. The row
-- keeps the fingerprint of the verified target, so a later configuration
-- change invalidates the proof; `code`/`expires_at` hold the pending step.

CREATE TABLE "notification_channel_verifications" (
	"kind" text PRIMARY KEY NOT NULL,
	"fingerprint" text DEFAULT '' NOT NULL,
	"code" text DEFAULT '' NOT NULL,
	"expires_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_channel_verifications_kind_check" CHECK ("kind" IN ('signal', 'matrix', 'ntfy', 'email', 'telegram', 'webpush', 'whatsapp'))
);
