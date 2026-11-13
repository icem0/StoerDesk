-- Configurable ticket statuses (WP-M14-35): the status of a ticket is no longer
-- hard-coded in `packages/shared/src/schemas/ticket.ts` (`TICKET_STATUS_VALUES`)
-- but stored in the `ticket_statuses` table, so an administrator can add,
-- rename or deactivate statuses in the administration (specs/07-escalation.md
-- §7.1, PLAN.md §7). The nine statuses of the current workflow are seeded by
-- `apps/api/src/db/seed/statuses.ts`.

CREATE TABLE "ticket_statuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_uuid_v7() NOT NULL,
	"key" text NOT NULL,
	"names" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"color" text DEFAULT '#6b7280' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"is_terminal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_statuses_key_check" CHECK ("key" IN ('NEW','IN_REVIEW','WORK_ORDER_CREATED','OFFERED','ASSIGNED','ACCEPTED','ACKNOWLEDGED','CLOSED','CANCELLED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_statuses_key_key" ON "ticket_statuses" USING btree ("key");
--> statement-breakpoint
CREATE INDEX "ticket_statuses_position_idx" ON "ticket_statuses" USING btree ("position");
