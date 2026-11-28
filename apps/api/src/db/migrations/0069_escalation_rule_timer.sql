-- The waiting clock of an escalation rule is a condition (ADR-0064, WP-M45-02,
-- specs/07-escalation.md §7.2, §7.6): the former rule fields become a
-- `timer_expired` leaf of the condition and the three columns fall.
--
-- A stage rule with `minutes` gets the timer `{ reference, minutes }`: its
-- explicit `reference`, otherwise the clock of its stage (§7.11) — the first
-- start value among the events that reach its predecessor; a predecessor that
-- the workflow never reaches hands its clock down, a stage without one waits
-- from `received_at`. A rule with a `percent` (and no stage minutes) gets the
-- timer `{ percent }`. The timer joins the old condition in one `all` group: an
-- `all` group takes it as its first child, any other condition becomes the
-- second child, an empty condition keeps the timer alone. A condition that
-- already carries a timer stays as it is. The keys of the rules, their actions
-- and the firing log are untouched — the rule `escalationRuleTimerCondition` of
-- `apps/api/src/escalation/config.ts` does the same for an old body.

CREATE TEMP TABLE "escalation_stage_clock" AS
WITH RECURSIVE "walk" ("stage_key", "current_key", "depth") AS (
  SELECT "key", "key", 0 FROM "escalation_stages"
  UNION ALL
  SELECT "walk"."stage_key", "predecessor"."key", "walk"."depth" + 1
    FROM "walk"
    JOIN "escalation_stages" "current" ON "current"."key" = "walk"."current_key"
    JOIN "escalation_stages" "predecessor" ON "predecessor"."key" = "current"."predecessor"
   WHERE jsonb_array_length("predecessor"."reached_by") = 0
     AND "predecessor"."key" <> "walk"."stage_key"
     AND "walk"."depth" < 25
),
"deepest" AS (
  SELECT DISTINCT ON ("stage_key") "stage_key", "current_key"
    FROM "walk"
   ORDER BY "stage_key", "depth" DESC
)
SELECT "deepest"."stage_key",
       CASE
         WHEN "predecessor"."key" IS NULL THEN 'received_at'
         ELSE (
           SELECT "event"."value"
             FROM jsonb_array_elements_text("predecessor"."reached_by") WITH ORDINALITY AS "event" ("value", "position")
            WHERE "event"."value" IN ('received_at', 'review_started', 'work_order_set', 'offered', 'assigned', 'accepted')
            ORDER BY "event"."position"
            LIMIT 1
         )
       END AS "reference"
  FROM "deepest"
  JOIN "escalation_stages" "current" ON "current"."key" = "deepest"."current_key"
  LEFT JOIN "escalation_stages" "predecessor" ON "predecessor"."key" = "current"."predecessor";
--> statement-breakpoint
CREATE TEMP TABLE "escalation_rule_timer" AS
SELECT "rule"."key",
       CASE
         WHEN jsonb_path_exists(COALESCE("rule"."condition", '{}'::jsonb), '$.** ? (@.field == "timer_expired")') THEN NULL
         WHEN "rule"."stage_key" IS NOT NULL AND "rule"."minutes" IS NOT NULL THEN (
           CASE
             WHEN COALESCE(
                    CASE WHEN "rule"."reference" IN ('received_at', 'review_started', 'work_order_set', 'offered', 'assigned', 'accepted') THEN "rule"."reference" END,
                    "clock"."reference"
                  ) IS NULL THEN NULL
             ELSE jsonb_build_object(
               'field', 'timer_expired',
               'operator', 'expired',
               'value', jsonb_build_object(
                 'reference', COALESCE(
                   CASE WHEN "rule"."reference" IN ('received_at', 'review_started', 'work_order_set', 'offered', 'assigned', 'accepted') THEN "rule"."reference" END,
                   "clock"."reference"
                 ),
                 'minutes', "rule"."minutes"
               )
             )
           END
         )
         WHEN "rule"."percent" IS NOT NULL THEN jsonb_build_object(
           'field', 'timer_expired',
           'operator', 'expired',
           'value', jsonb_build_object('percent', "rule"."percent")
         )
         ELSE NULL
       END AS "timer"
  FROM "escalation_rules" "rule"
  LEFT JOIN "escalation_stage_clock" "clock" ON "clock"."stage_key" = "rule"."stage_key";
--> statement-breakpoint
UPDATE "escalation_rules" "rule"
   SET "condition" = CASE
         WHEN "rule"."condition" IS NULL
           OR jsonb_typeof("rule"."condition") <> 'object'
           OR (("rule"."condition" -> 'all') IS NULL AND ("rule"."condition" -> 'any') IS NULL AND ("rule"."condition" -> 'field') IS NULL)
           THEN jsonb_build_object('all', jsonb_build_array("timer"."timer"))
         WHEN jsonb_typeof("rule"."condition" -> 'all') = 'array'
           THEN jsonb_build_object('all', jsonb_build_array("timer"."timer") || ("rule"."condition" -> 'all'))
         ELSE jsonb_build_object('all', jsonb_build_array("timer"."timer", "rule"."condition"))
       END,
       "updated_at" = now()
  FROM "escalation_rule_timer" "timer"
 WHERE "timer"."key" = "rule"."key" AND "timer"."timer" IS NOT NULL;
--> statement-breakpoint
DROP TABLE "escalation_rule_timer";
--> statement-breakpoint
DROP TABLE "escalation_stage_clock";
--> statement-breakpoint
ALTER TABLE "escalation_rules" DROP CONSTRAINT IF EXISTS "escalation_rules_clock_check";
--> statement-breakpoint
ALTER TABLE "escalation_rules" DROP COLUMN IF EXISTS "reference";
--> statement-breakpoint
ALTER TABLE "escalation_rules" DROP COLUMN IF EXISTS "minutes";
--> statement-breakpoint
ALTER TABLE "escalation_rules" DROP COLUMN IF EXISTS "percent";
