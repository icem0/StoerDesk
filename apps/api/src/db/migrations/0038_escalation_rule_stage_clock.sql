-- A stage rule may take the clock of its stage (WP-M14-59, WP-M14-62,
-- ADR-0023): `reference` is then NULL while `minutes` carries the deadline.
-- The former check demanded a reference for every minutes rule and is replaced.

ALTER TABLE "escalation_rules" DROP CONSTRAINT "escalation_rules_clock_check";
--> statement-breakpoint
ALTER TABLE "escalation_rules" ADD CONSTRAINT "escalation_rules_clock_check" CHECK (("minutes" IS NOT NULL) OR ("percent" IS NOT NULL AND "percent" BETWEEN 1 AND 100));
