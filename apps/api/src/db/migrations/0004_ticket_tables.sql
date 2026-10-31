CREATE TABLE "ticket_no_counters" (
	"year" integer PRIMARY KEY NOT NULL,
	"next_value" integer NOT NULL
);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION next_ticket_no()
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
	report_year integer := EXTRACT(YEAR FROM now())::integer;
	allocated integer;
BEGIN
	INSERT INTO ticket_no_counters (year, next_value)
	VALUES (report_year, 1)
	ON CONFLICT (year) DO UPDATE SET next_value = ticket_no_counters.next_value + 1
	RETURNING next_value INTO allocated;

	RETURN 'ST-' || report_year || '-' || lpad(allocated::text, 4, '0');
END;
$function$;
--> statement-breakpoint
CREATE TABLE "ticket_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_uuid_v7() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"type" text NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_user_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_events_actor_kind_check" CHECK ("ticket_events"."actor_kind" IN ('user', 'public', 'system'))
);
--> statement-breakpoint
CREATE TABLE "ticket_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_uuid_v7() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"file_path" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"width_px" integer,
	"height_px" integer,
	"uploader_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_photos_mime_type_check" CHECK ("ticket_photos"."mime_type" IN ('image/jpeg', 'image/png'))
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_uuid_v7() NOT NULL,
	"ticket_no" text DEFAULT next_ticket_no() NOT NULL,
	"object_id" uuid NOT NULL,
	"system_id" uuid,
	"status" text DEFAULT 'NEW' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"title" text,
	"description" text,
	"fault_template_keys" text[] DEFAULT '{}'::text[] NOT NULL,
	"source" text DEFAULT 'QR' NOT NULL,
	"reported_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"clock_skewed" boolean DEFAULT false NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"reporter_name" text,
	"reporter_phone" text,
	"reporter_email" text,
	"client_uuid" uuid,
	"status_token" text,
	"suspected_spam" boolean DEFAULT false NOT NULL,
	"parent_ticket_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tickets_status_check" CHECK ("tickets"."status" IN ('NEW', 'IN_REVIEW', 'WORK_ORDER_CREATED', 'OFFERED', 'ASSIGNED', 'ACCEPTED', 'ACKNOWLEDGED', 'CLOSED', 'CANCELLED')),
	CONSTRAINT "tickets_priority_check" CHECK ("tickets"."priority" IN ('low', 'normal', 'high', 'critical')),
	CONSTRAINT "tickets_source_check" CHECK ("tickets"."source" IN ('QR', 'INTERNAL', 'API'))
);
--> statement-breakpoint
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_photos" ADD CONSTRAINT "ticket_photos_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_photos" ADD CONSTRAINT "ticket_photos_uploader_user_id_users_id_fk" FOREIGN KEY ("uploader_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_object_id_objects_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."objects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_system_id_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."systems"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_parent_ticket_id_tickets_id_fk" FOREIGN KEY ("parent_ticket_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ticket_events_ticket_id_idx" ON "ticket_events" USING btree ("ticket_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_photos_file_path_key" ON "ticket_photos" USING btree ("file_path");--> statement-breakpoint
CREATE INDEX "ticket_photos_ticket_id_idx" ON "ticket_photos" USING btree ("ticket_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tickets_ticket_no_key" ON "tickets" USING btree ("ticket_no");--> statement-breakpoint
CREATE UNIQUE INDEX "tickets_client_uuid_key" ON "tickets" USING btree ("client_uuid");--> statement-breakpoint
CREATE UNIQUE INDEX "tickets_status_token_key" ON "tickets" USING btree ("status_token");--> statement-breakpoint
CREATE INDEX "tickets_object_id_reported_at_idx" ON "tickets" USING btree ("object_id","reported_at");--> statement-breakpoint
CREATE INDEX "tickets_status_idx" ON "tickets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tickets_parent_ticket_id_idx" ON "tickets" USING btree ("parent_ticket_id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ticket_events_append_only()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
	-- the cascade of a hard-deleted ticket may remove its own trail,
	-- a direct DELETE on ticket_events may not
	IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
		RETURN OLD;
	END IF;

	RAISE EXCEPTION 'ticket_event_append_only: %', OLD.type USING ERRCODE = 'raise_exception';
END;
$function$;
--> statement-breakpoint
CREATE TRIGGER ticket_events_is_append_only
	BEFORE UPDATE OR DELETE ON "ticket_events"
	FOR EACH ROW
	EXECUTE FUNCTION ticket_events_append_only();
