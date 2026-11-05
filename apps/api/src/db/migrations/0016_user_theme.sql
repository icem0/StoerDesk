ALTER TABLE "users" ADD COLUMN "theme" text DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_theme_check" CHECK ("users"."theme" IN ('auto', 'light', 'dark'));
