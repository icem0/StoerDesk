-- The rules and their actions are numbered (WP-M14-99, specs/07-escalation.md
-- §7.5): the key of a rule is the key of its stage and its number — `review#1` —
-- the key of an action the key of its rule and its number — `review#1#1`. A rule
-- without a stage belongs to the root `deadline` — `deadline#1`. The number of a
-- rule is its position inside its stage, the number of an action its position
-- inside its rule; the installation keeps its order. The key of a rule is the
-- identity of the firing log, so the log and the actions follow the rename; the
-- foreign key of the actions is dropped for the rename and restored afterwards.

ALTER TABLE "escalation_actions" DROP CONSTRAINT "escalation_actions_rule_key_escalation_rules_key_fk";
--> statement-breakpoint
CREATE TEMP TABLE "escalation_rule_numbering" AS SELECT "id", "key" AS "old_key", COALESCE("stage_key", 'deadline') || '#' || (row_number() OVER (PARTITION BY COALESCE("stage_key", 'deadline') ORDER BY "position", "key"))::int AS "new_key" FROM "escalation_rules";
--> statement-breakpoint
UPDATE "escalation_rules" SET "key" = "numbering"."new_key" FROM "escalation_rule_numbering" AS "numbering" WHERE "escalation_rules"."id" = "numbering"."id";
--> statement-breakpoint
UPDATE "escalation_actions" SET "rule_key" = "numbering"."new_key" FROM "escalation_rule_numbering" AS "numbering" WHERE "escalation_actions"."rule_key" = "numbering"."old_key";
--> statement-breakpoint
UPDATE "escalation_firings" SET "rule_key" = "numbering"."new_key" FROM "escalation_rule_numbering" AS "numbering" WHERE "escalation_firings"."rule_key" = "numbering"."old_key";
--> statement-breakpoint
UPDATE "escalation_actions" AS "action" SET "key" = "numbering"."new_key" FROM (SELECT "id", "rule_key" || '#' || (row_number() OVER (PARTITION BY "rule_key" ORDER BY "position", "key"))::int AS "new_key" FROM "escalation_actions") AS "numbering" WHERE "action"."id" = "numbering"."id";
--> statement-breakpoint
DROP TABLE "escalation_rule_numbering";
--> statement-breakpoint
ALTER TABLE "escalation_actions" ADD CONSTRAINT "escalation_actions_rule_key_escalation_rules_key_fk" FOREIGN KEY ("rule_key") REFERENCES "public"."escalation_rules"("key") ON DELETE cascade ON UPDATE no action;
