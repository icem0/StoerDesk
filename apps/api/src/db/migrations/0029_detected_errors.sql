-- Detected-error catalog (WP-M11-02): a table of machine keys with localized
-- labels, archived instead of deleted so existing tickets keep their keys.
-- `tickets.detected_error_keys` stores the selected keys at ticket close.
CREATE TABLE "detected_errors" (
	"id" uuid PRIMARY KEY DEFAULT gen_uuid_v7(),
	"key" text NOT NULL UNIQUE,
	"label_de" text NOT NULL,
	"label_en" text NOT NULL,
	"archived_at" timestamptz,
	"created_at" timestamptz NOT NULL DEFAULT now(),
	"updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "detected_errors_key_idx" ON "detected_errors" USING btree ("key");
--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "detected_error_keys" text[] NOT NULL DEFAULT '{}'::text[];
