ALTER TABLE "text_templates" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "text_templates_archived_at_idx" ON "text_templates" USING btree ("archived_at");