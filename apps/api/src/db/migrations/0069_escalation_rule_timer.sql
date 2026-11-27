-- The waiting clock of a rule is a condition (WP-M45-02, ADR-0064 decision 8,
-- specs/07-escalation.md §7.2/§7.6): `reference` and `minutes` of every stage
-- rule and `percent` of every deadline rule become a `timer_expired` leaf in the
-- `condition`. A rule without `reference` took the clock of its stage — the
-- first event of the `reached_by` of its predecessor that is a start value of a
-- timer, a predecessor without events hands its clock down, the chain start
-- waits from `received_at` (`escalationStageClockEvents`). The timer and the old
-- condition merge into one `all` group: an `all` group keeps its leaves behind
-- the timer, any other condition becomes the second member of the group. The
-- keys, the actions and the firing log stay untouched; afterwards the three
-- columns and their CHECK of 0038 fall.

CREATE TEMP TABLE "escalation_rule_timer" AS
WITH RECURSIVE "walk"("rule_id", "stage_key", "depth") AS (
  SELECT "id", "stage_key", 0 FROM "escalation_rules" WHERE "minutes" IS NOT NULL AND "percent" IS NULL AND "stage_key" IS NOT NULL
  UNION ALL
  SELECT "walk"."rule_id", "stage"."predecessor", "walk"."depth" + 1
  FROM "walk"
  JOIN "escalation_stages" AS "stage" ON "stage"."key" = "walk"."stage_key"
  JOIN "escalation_stages" AS "predecessor" ON "predecessor"."key" = "stage"."predecessor"
  WHERE jsonb_array_length("predecessor"."reached_by") = 0 AND "walk"."depth" < 20
),
"deepest" AS (
  SELECT DISTINCT ON ("rule_id") "rule_id", "stage_key" FROM "walk" ORDER BY "rule_id", "depth" DESC
),
"clock" AS (
  SELECT "deepest"."rule_id", (
    SELECT "event"."value"
    FROM "escalation_stages" AS "stage"
    JOIN "escalation_stages" AS "predecessor" ON "predecessor"."key" = "stage"."predecessor"
    CROSS JOIN LATERAL jsonb_array_elements_text("predecessor"."reached_by") WITH ORDINALITY AS "event"("value", "ordinal")
    WHERE "stage"."key" = "deepest"."stage_key"
      AND "event"."value" IN ('received_at', 'review_started', 'work_order_set', 'offered', 'assigned', 'accepted')
    ORDER BY "event"."ordinal"
    LIMIT 1
  ) AS "reference"
  FROM "deepest"
)
SELECT "rule"."id", jsonb_build_object(
  'field', 'timer_expired',
  'operator', 'expired',
  'value', CASE
    WHEN "rule"."percent" IS NOT NULL THEN jsonb_build_object('percent', "rule"."percent")
    ELSE jsonb_build_object(
      'reference', COALESCE(
        CASE WHEN "rule"."reference" IN ('received_at', 'review_started', 'work_order_set', 'offered', 'assigned', 'accepted') THEN "rule"."reference" END,
        "clock"."reference",
        'received_at'
      ),
      'minutes', "rule"."minutes"
    )
  END
) AS "timer"
FROM "escalation_rules" AS "rule"
LEFT JOIN "clock" ON "clock"."rule_id" = "rule"."id"
WHERE "rule"."percent" IS NOT NULL OR "rule"."minutes" IS NOT NULL;
--> statement-breakpoint
UPDATE "escalation_rules" SET "condition" = CASE
  WHEN jsonb_typeof("escalation_rules"."condition" -> 'all') = 'array'
    THEN jsonb_build_object('all', jsonb_build_array("timer"."timer") || ("escalation_rules"."condition" -> 'all'))
  ELSE jsonb_build_object('all', jsonb_build_array("timer"."timer", "escalation_rules"."condition"))
END
FROM "escalation_rule_timer" AS "timer"
WHERE "escalation_rules"."id" = "timer"."id";
--> statement-breakpoint
DROP TABLE "escalation_rule_timer";
--> statement-breakpoint
ALTER TABLE "escalation_rules" DROP CONSTRAINT IF EXISTS "escalation_rules_clock_check";
--> statement-breakpoint
ALTER TABLE "escalation_rules" DROP COLUMN "reference";
--> statement-breakpoint
ALTER TABLE "escalation_rules" DROP COLUMN "minutes";
--> statement-breakpoint
ALTER TABLE "escalation_rules" DROP COLUMN "percent";
