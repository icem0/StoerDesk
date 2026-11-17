-- The chain starts with the stage NEW (WP-M14-116, specs/07-escalation.md §7.1,
-- §7.11): an installed chain gets the stage of the arrival of the ticket as its
-- first stage. The stage `new` has no reaching event — the workflow never
-- reaches it — and the old first stage names it as predecessor. Every stage
-- moves one position behind, so `new` takes position 1; the milestones, the
-- clocks and the minutes of the other stages keep their rows and rule keys
-- untouched. An empty chain stays alone — a fresh installation takes the whole
-- chain of §7.1 from the seed — and so does an installation that already knows
-- the stage or whose positions reached the limit of 20.

CREATE TEMP TABLE "escalation_stage_new_guard" AS SELECT true AS "add"
 WHERE NOT EXISTS (SELECT "key" FROM "escalation_stages" WHERE "key" = 'new')
   AND (SELECT COUNT(1) FROM "escalation_stages") BETWEEN 1 AND 19
   AND COALESCE((SELECT MAX("position") FROM "escalation_stages"), 0) < 20;
--> statement-breakpoint
UPDATE "escalation_stages" SET "position" = "position" + 1 WHERE EXISTS (SELECT true FROM "escalation_stage_new_guard");
--> statement-breakpoint
UPDATE "escalation_stages" SET "predecessor" = 'new' WHERE "predecessor" IS NULL AND EXISTS (SELECT true FROM "escalation_stage_new_guard");
--> statement-breakpoint
INSERT INTO "escalation_stages" ("key", "names", "position", "active", "predecessor", "reached_by")
SELECT 'new', '{"de": "Neu", "en": "New"}'::jsonb, 1, true, NULL, '[]'::jsonb
 FROM "escalation_stage_new_guard";
--> statement-breakpoint
INSERT INTO "escalation_rules" ("key", "stage_key", "reference", "minutes", "percent", "condition", "position", "active")
SELECT 'new#1', 'new', 'received_at', '{"low": 15, "normal": 15, "high": 15, "critical": 5}'::jsonb, NULL, '{"all": []}'::jsonb, 0, true
 FROM "escalation_stage_new_guard";
--> statement-breakpoint
DROP TABLE "escalation_stage_new_guard";
