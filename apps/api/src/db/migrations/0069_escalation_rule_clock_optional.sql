-- The waiting clock of a rule is the `timer_expired` leaf of its condition
-- (ADR-0064, WP-M45-02): the engine and the configuration service read the
-- clock from the condition, and the administration writes it there. A rule
-- may therefore carry neither `minutes` nor `percent` — a rule without a timer
-- waits with zero delay from the start of the wait of its stage (§7.11).
--
-- The check of 0038 demanded one of the two clock columns and falls. The
-- columns themselves stay readable until migration 0070 converts the old rows
-- into timer conditions and drops them (WP-M45-04).
ALTER TABLE "escalation_rules" DROP CONSTRAINT "escalation_rules_clock_check";
