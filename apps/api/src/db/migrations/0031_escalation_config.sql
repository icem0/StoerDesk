-- The escalation configuration (WP-M13-03): the five workflow stages, the rules
-- with their waiting deadlines, their conditions and their actions, and the
-- firing log that makes a rule fire exactly once per ticket, rule and
-- threshold (specs/07-escalation.md §7.6, ADR-0017).
--
-- The stage keys are fixed by the workflow; the names and the active flag are
-- maintained in the administration. The rules and the actions are the
-- configuration of the installation; the seed of WP-M13-04 fills them.

CREATE TABLE "escalation_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_uuid_v7() NOT NULL,
	"key" text NOT NULL,
	"names" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "escalation_stages_key_check" CHECK ("key" IN ('review','work_order','assignment','acceptance','acknowledgement'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "escalation_stages_key_key" ON "escalation_stages" USING btree ("key");
--> statement-breakpoint
CREATE INDEX "escalation_stages_position_idx" ON "escalation_stages" USING btree ("position");

CREATE TABLE "escalation_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_uuid_v7() NOT NULL,
	"key" text NOT NULL,
	"stage_key" text,
	"reference" text,
	"minutes" jsonb,
	"percent" integer,
	"condition" jsonb DEFAULT '{"all":[]}'::jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "escalation_rules_stage_key_check" CHECK ("stage_key" IS NULL OR "stage_key" IN ('review','work_order','assignment','acceptance','acknowledgement')),
	CONSTRAINT "escalation_rules_reference_check" CHECK ("reference" IS NULL OR "reference" IN ('received_at','review_started','work_order_set','offered','assigned','accepted')),
	CONSTRAINT "escalation_rules_clock_check" CHECK (("reference" IS NOT NULL AND "minutes" IS NOT NULL) OR ("percent" IS NOT NULL AND "percent" BETWEEN 1 AND 100))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "escalation_rules_key_key" ON "escalation_rules" USING btree ("key");
--> statement-breakpoint
CREATE INDEX "escalation_rules_stage_key_idx" ON "escalation_rules" USING btree ("stage_key");

CREATE TABLE "escalation_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_uuid_v7() NOT NULL,
	"key" text NOT NULL,
	"rule_key" text NOT NULL,
	"type" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"condition" jsonb DEFAULT '{"all":[]}'::jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "escalation_actions_type_check" CHECK ("type" IN ('notify','webhook','history'))
);
--> statement-breakpoint
ALTER TABLE "escalation_actions" ADD CONSTRAINT "escalation_actions_rule_key_escalation_rules_key_fk" FOREIGN KEY ("rule_key") REFERENCES "public"."escalation_rules"("key") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "escalation_actions_rule_key_key" ON "escalation_actions" USING btree ("rule_key","key");
--> statement-breakpoint
CREATE INDEX "escalation_actions_rule_key_idx" ON "escalation_actions" USING btree ("rule_key");

CREATE TABLE "escalation_firings" (
	"id" uuid PRIMARY KEY DEFAULT gen_uuid_v7() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"rule_key" text NOT NULL,
	"stage_key" text,
	"threshold_at" timestamp with time zone NOT NULL,
	"fired_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "escalation_firings" ADD CONSTRAINT "escalation_firings_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "escalation_firings_ticket_rule_threshold_key" ON "escalation_firings" USING btree ("ticket_id","rule_key","threshold_at");
--> statement-breakpoint
CREATE INDEX "escalation_firings_ticket_id_idx" ON "escalation_firings" USING btree ("ticket_id");
--> statement-breakpoint
CREATE INDEX "escalation_firings_rule_key_idx" ON "escalation_firings" USING btree ("rule_key");
