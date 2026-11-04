-- Server-side receipts for replayed internal actions (WP-M5-02).
-- The client_uuid unique key mirrors the client outbox and makes a replayed
-- acknowledge/comment/decline idempotent: a second insert with the same
-- client_uuid is rejected.
CREATE TABLE "internal_action_receipts" (
  "id" uuid NOT NULL DEFAULT gen_uuid_v7(),
  "client_uuid" text NOT NULL,
  "ticket_id" uuid NOT NULL,
  "actor_user_id" uuid,
  "action" text NOT NULL,
  "event_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "internal_action_receipts_id_pk" PRIMARY KEY ("id")
);--> statement-breakpoint
ALTER TABLE "internal_action_receipts" ADD CONSTRAINT "internal_action_receipts_client_uuid_key" UNIQUE ("client_uuid");--> statement-breakpoint
ALTER TABLE "internal_action_receipts" ADD CONSTRAINT "internal_action_receipts_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_action_receipts" ADD CONSTRAINT "internal_action_receipts_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_action_receipts" ADD CONSTRAINT "internal_action_receipts_event_id_ticket_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."ticket_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "internal_action_receipts_ticket_id_idx" ON "internal_action_receipts" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "internal_action_receipts_created_at_idx" ON "internal_action_receipts" USING btree ("created_at");
