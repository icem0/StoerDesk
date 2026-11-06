-- Repair for migration 0012_ticket_purges. Its journal entry carried a
-- seconds timestamp, so Drizzle's migrator (which applies only entries newer
-- than the latest applied one) skipped it on every database that already had
-- migration 0011 or later. This migration recreates the ticket_purges table
-- idempotently, so databases that missed 0012 get it on the next start.
CREATE TABLE IF NOT EXISTS "ticket_purges" (
  "id" uuid NOT NULL DEFAULT gen_uuid_v7(),
  "ticket_no" text NOT NULL,
  "object_no" text NOT NULL,
  "actor_user_id" uuid,
  "reason" text,
  "deleted_events_count" integer NOT NULL,
  "deleted_photos_count" integer NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ticket_purges_id_pk" PRIMARY KEY ("id")
);--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "ticket_purges" ADD CONSTRAINT "ticket_purges_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticket_purges_created_at_idx" ON "ticket_purges" USING btree ("created_at");
