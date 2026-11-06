CREATE TABLE "oncall_pools" (
	"id" uuid PRIMARY KEY DEFAULT gen_uuid_v7() NOT NULL,
	"name" text NOT NULL,
	"group_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oncall_pools_name_trimmed_length_check" CHECK (TRIM("oncall_pools"."name") = "oncall_pools"."name" AND LENGTH("oncall_pools"."name") BETWEEN 1 AND 100)
);
--> statement-breakpoint
CREATE TABLE "oncall_shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_uuid_v7() NOT NULL,
	"pool_id" uuid NOT NULL,
	"user_id" uuid,
	"state" text DEFAULT 'UNFILLED' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	"declined_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oncall_shifts_state_check" CHECK ("oncall_shifts"."state" IN ('UNFILLED', 'DRAFT', 'PLANNED', 'CONFIRMED', 'DECLINED', 'SWAP_REQUESTED')),
	CONSTRAINT "oncall_shifts_ends_at_after_starts_at_check" CHECK ("oncall_shifts"."ends_at" > "oncall_shifts"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "oncall_swap_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_uuid_v7() NOT NULL,
	"shift_id" uuid NOT NULL,
	"requested_by_user_id" uuid,
	"target_user_id" uuid,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"accepted_by_user_id" uuid,
	"accepted_at" timestamp with time zone,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oncall_swap_requests_status_check" CHECK ("oncall_swap_requests"."status" IN ('PENDING', 'ACCEPTED', 'APPROVED', 'DECLINED', 'CANCELLED', 'EXPIRED'))
);
--> statement-breakpoint
CREATE TABLE "oncall_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_uuid_v7() NOT NULL,
	"shift_id" uuid NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_user_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"client_uuid" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oncall_events_actor_kind_check" CHECK ("oncall_events"."actor_kind" IN ('user', 'system'))
);
--> statement-breakpoint
ALTER TABLE "oncall_pools" ADD CONSTRAINT "oncall_pools_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oncall_shifts" ADD CONSTRAINT "oncall_shifts_pool_id_oncall_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."oncall_pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oncall_shifts" ADD CONSTRAINT "oncall_shifts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oncall_shifts" ADD CONSTRAINT "oncall_shifts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oncall_swap_requests" ADD CONSTRAINT "oncall_swap_requests_shift_id_oncall_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."oncall_shifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oncall_swap_requests" ADD CONSTRAINT "oncall_swap_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oncall_swap_requests" ADD CONSTRAINT "oncall_swap_requests_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oncall_swap_requests" ADD CONSTRAINT "oncall_swap_requests_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oncall_swap_requests" ADD CONSTRAINT "oncall_swap_requests_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oncall_events" ADD CONSTRAINT "oncall_events_shift_id_oncall_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."oncall_shifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oncall_events" ADD CONSTRAINT "oncall_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "oncall_shifts_pool_id_starts_at_ends_at_idx" ON "oncall_shifts" USING btree ("pool_id","starts_at","ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "oncall_shifts_pool_id_starts_at_key" ON "oncall_shifts" USING btree ("pool_id","starts_at");--> statement-breakpoint
CREATE INDEX "oncall_swap_requests_shift_id_idx" ON "oncall_swap_requests" USING btree ("shift_id");--> statement-breakpoint
CREATE UNIQUE INDEX "oncall_swap_requests_one_pending_per_shift" ON "oncall_swap_requests" USING btree ("shift_id") WHERE "oncall_swap_requests"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "oncall_events_shift_id_idx" ON "oncall_events" USING btree ("shift_id");--> statement-breakpoint
CREATE UNIQUE INDEX "oncall_pools_name_key" ON "oncall_pools" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "oncall_events_client_uuid_key" ON "oncall_events" USING btree ("client_uuid");--> statement-breakpoint
CREATE OR REPLACE FUNCTION oncall_event_append_only()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
	-- the cascade of a hard-deleted shift may remove its own events,
	-- a direct DELETE on oncall_events may not
	IF TG_OP = 'DELETE' THEN
		IF pg_trigger_depth() > 1 THEN
			RETURN OLD;
		END IF;

		-- explicit bypass for hard-deleting a shift (and cascading its events)
		-- via SET LOCAL inside the transaction, like ticket hard-delete
		IF current_setting('stoerdesk.allow_oncall_event_delete', true) = 'true' THEN
			RETURN OLD;
		END IF;
	END IF;

	RAISE EXCEPTION 'oncall_event_append_only' USING ERRCODE = 'raise_exception';
END;
$function$;
--> statement-breakpoint
CREATE TRIGGER oncall_events_is_append_only
	BEFORE UPDATE OR DELETE ON "oncall_events"
	FOR EACH ROW
	EXECUTE FUNCTION oncall_event_append_only();
