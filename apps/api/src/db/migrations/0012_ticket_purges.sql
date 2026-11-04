-- Append-only log of permanently deleted tickets (WP-M2-76).
-- A hard-deleted ticket cascades its ticket_events and ticket_photos rows;
-- this table keeps the accountability record without reporter contact data
-- or ticket content.
CREATE TABLE "ticket_purges" (
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
ALTER TABLE "ticket_purges" ADD CONSTRAINT "ticket_purges_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ticket_purges_created_at_idx" ON "ticket_purges" USING btree ("created_at");
