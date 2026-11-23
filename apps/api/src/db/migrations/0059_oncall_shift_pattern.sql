-- The pattern of a duty block (`specs/04-oncall.md` §4a.3.3, ADR-0040): the
-- covered weekdays (`0` = Sunday) with the daily window of the block as the
-- wall clock of `Europe/Berlin`.
--
-- A shift without a pattern keeps covering its whole span: the continuous
-- plan of ADR-0011 (decision 6 of ADR-0040) and the day windows of ADR-0035
-- stay valid, so the rows of an older version need no backfill. The
-- generator writes the pattern of a block (WP-M20-03).
ALTER TABLE "oncall_shifts" ADD COLUMN "weekdays" text;
--> statement-breakpoint
ALTER TABLE "oncall_shifts" ADD COLUMN "daily_start" text;
--> statement-breakpoint
ALTER TABLE "oncall_shifts" ADD COLUMN "daily_end" text;
