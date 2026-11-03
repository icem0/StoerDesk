CREATE TABLE "update_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_uuid_v7() NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'RUNNING' NOT NULL,
	"before_version" text,
	"after_version" text,
	"error_code" text,
	"agent_run_id" text,
	CONSTRAINT "update_runs_status_check" CHECK ("update_runs"."status" IN ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED'))
);
--> statement-breakpoint
CREATE INDEX "update_runs_started_at_idx" ON "update_runs" USING btree ("started_at");