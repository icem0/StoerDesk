-- The escalation stage chain becomes configuration (WP-M14-59, ADR-0023):
-- a stage carries a predecessor and the events that reach it. The fixed-key
-- CHECKs leave; the rules of a removed stage are removed by the foreign key.

ALTER TABLE "escalation_stages" ADD COLUMN "predecessor" text;
--> statement-breakpoint
ALTER TABLE "escalation_stages" ADD COLUMN "reached_by" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint

UPDATE "escalation_stages" SET "predecessor" = NULL, "reached_by" = '["review_started"]'::jsonb WHERE "key" = 'review';
--> statement-breakpoint
UPDATE "escalation_stages" SET "predecessor" = 'review', "reached_by" = '["work_order_set"]'::jsonb WHERE "key" = 'work_order';
--> statement-breakpoint
UPDATE "escalation_stages" SET "predecessor" = 'work_order', "reached_by" = '["assigned","offered"]'::jsonb WHERE "key" = 'assignment';
--> statement-breakpoint
UPDATE "escalation_stages" SET "predecessor" = 'assignment', "reached_by" = '["accepted"]'::jsonb WHERE "key" = 'acceptance';
--> statement-breakpoint
UPDATE "escalation_stages" SET "predecessor" = 'acceptance', "reached_by" = '["acknowledged"]'::jsonb WHERE "key" = 'acknowledgement';
--> statement-breakpoint

ALTER TABLE "escalation_stages" DROP CONSTRAINT "escalation_stages_key_check";
--> statement-breakpoint
CREATE INDEX "escalation_stages_predecessor_idx" ON "escalation_stages" USING btree ("predecessor");
--> statement-breakpoint

ALTER TABLE "escalation_rules" DROP CONSTRAINT "escalation_rules_stage_key_check";
--> statement-breakpoint
ALTER TABLE "escalation_rules" DROP CONSTRAINT "escalation_rules_reference_check";
--> statement-breakpoint
ALTER TABLE "escalation_rules" ADD CONSTRAINT "escalation_rules_stage_key_escalation_stages_key_fk" FOREIGN KEY ("stage_key") REFERENCES "public"."escalation_stages"("key") ON DELETE cascade ON UPDATE no action;
