CREATE TABLE "bma_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_uuid_v7() NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'RUNNING' NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"created" integer DEFAULT 0 NOT NULL,
	"updated" integer DEFAULT 0 NOT NULL,
	"unchanged" integer DEFAULT 0 NOT NULL,
	"deactivated" integer DEFAULT 0 NOT NULL,
	"conflicts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error_code" text,
	CONSTRAINT "bma_sync_runs_status_check" CHECK ("bma_sync_runs"."status" IN ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED'))
);
--> statement-breakpoint
CREATE INDEX "bma_sync_runs_started_at_idx" ON "bma_sync_runs" USING btree ("started_at");